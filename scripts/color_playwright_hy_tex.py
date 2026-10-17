# Запуск: blender -b -P scripts/color_playwright_hy_tex.py -- <outdir> label=path.glb [label=path.glb ...]
# Playwright (сетка Hunyuan3D MV, Weld+FillHoles+Decimate+MeshSmoothNormals): геометрия не меняется.
# Покраска как у JS-блока: палитра 512x512 по UV вершин. Из самой сетки строится карта глубины (z-буфер вида спереди), по ней
# водоразделом от «ядер» двух масок (спереди назад) находится граница красной/зелёной маски - ровно по ложбине между ними.
# UV вершины: u = категория (метка маски и сторона от центра маски), v = глубина y; середина палитры по v лежит на изолинии y = Y_EDGE,
# поэтому граница плиты/маски гладкая и не зависит от треугольников (при покраске по граням на плавных краях получались рваные заплатки).
# Цвета и тоны берутся с референса ref_playwright.png.
# Результат: <outdir>/emblem_playwright_hy_tex.blend и по одному цветному GLB на размер (<outdir>/<label>_tex.glb).
import bpy, bmesh, numpy as np, math, sys, os
from collections import deque
from mathutils import Vector, Euler, kdtree

ROOT = "D:/cursorTestProjects/mypage"
args = sys.argv[sys.argv.index("--") + 1:]
OUTDIR = args[0]
JOBS = [a.split("=", 1) for a in args[1:]]
os.makedirs(OUTDIR, exist_ok=True)
RAST_W, RAST_H = 2048, 1536       # разрешение карты глубины (z-буфер вида спереди)
SEAM_WIDTH = float(os.environ.get("SEAM_WIDTH", "0.012"))   # ширина линии шва между масками (в единицах модели, вся модель около 2)
TONE_BAND = 0.040                 # ширина перехода тёмная/светлая половина по x
EDGE_BAND = 0.020                # ширина перехода плита/маска по глубине (v палитры сжимается до +-0.5 за этот интервал)
X0, X1, Z0, Z1 = -1.0, 1.0, -0.75, 0.75
Y_EDGE = float(os.environ.get("Y_EDGE", "-0.045"))   # изолиния глубины между плитой (около -0.036) и верхом масок (около -0.10)
TOP_Y, CORE_Y, SPLIT_DEG = -0.060, -0.095, 60
STEP = 2.4

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.name = "Playwright_hy_tex"
coll = sc.collection
vl = bpy.context.view_layer

# ---------- цвета из референса ----------
ref_img = bpy.data.images.load(f"{ROOT}/assets-src/refs/ref_playwright.png")
RW, RH = ref_img.size
px = np.array(ref_img.pixels[:], np.float32).reshape(RH, RW, 4)[::-1, :, :3]
front = px[: RH // 2, : RW // 2]
r_, g_, b_ = front[..., 0], front[..., 1], front[..., 2]
bg = (g_ > 0.84) & (r_ < 0.3) & (b_ < 0.3)
red = (r_ > g_ + 0.15) & (r_ > b_ + 0.15) & ~bg
green = (g_ > r_ + 0.10) & (g_ > b_ + 0.10) & ~bg
plate = ~bg & ~red & ~green
Wf = front.shape[1]
nb = bg.copy()
for _ in range(3):
    p = np.pad(nb, 1, constant_values=False)
    nb = nb | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]


def tones(mask):
    xs_ = np.where(mask.any(0))[0]
    mid = (xs_.min() + xs_.max()) / 2
    xx = np.arange(Wf)[None, :]
    lm = mask & (xx < mid - 4)
    rm = mask & (xx > mid + 4)
    return np.array(np.median(front[lm], axis=0)), np.array(np.median(front[rm], axis=0))


RED_L, RED_R = tones(red & ~nb)
GRN_L, GRN_R = tones(green & ~nb)
pm_ = plate & ~nb & (b_ > r_)
lum = front.mean(axis=2)
lo_, hi_ = np.percentile(lum[pm_], [50, 92])
PLATE_C = np.array(np.median(front[pm_ & (lum >= lo_) & (lum <= hi_)], axis=0))
print("tones: red", (RED_L * 255).astype(int), (RED_R * 255).astype(int), "green", (GRN_L * 255).astype(int), (GRN_R * 255).astype(int), "plate", (PLATE_C * 255).astype(int))


def ref_split_line(mask_ref, tone_l, tone_r):
    """точки границы тёмной и светлой половины маски на референсе: (y_px, x_px) по строкам"""
    pts = []
    for y in np.where(mask_ref.any(1))[0]:
        xs = np.where(mask_ref[y])[0]
        if len(xs) < 30:
            continue
        cols = front[y, xs]
        dl = np.linalg.norm(cols - tone_l, axis=1)
        dr = np.linalg.norm(cols - tone_r, axis=1)
        left, right = xs[dl < dr], xs[dr <= dl]
        if len(left) < 8 or len(right) < 8:
            continue
        pts.append((y, (np.percentile(left, 95) + np.percentile(right, 5)) / 2))
    return np.array(pts, np.float64)


REF_MASK = (red | green) & ~nb
REF_BOX = (np.where(REF_MASK.any(0))[0][[0, -1]], np.where(REF_MASK.any(1))[0][[0, -1]])
REF_PTS_R = ref_split_line(red & ~nb, RED_L, RED_R)
REF_PTS_G = ref_split_line(green & ~nb, GRN_R, GRN_L)    # у зелёной тёмная половина справа: «левый» тон здесь GRN_R для подсчёта точек, границу даёт та же формула
print("ref split points: red", len(REF_PTS_R), "green", len(REF_PTS_G))


def core_faces(obj):
    """центры «ядер» красной и зелёной масок (x, z) - по связным областям глубоких граней, как в color_playwright_hy.py"""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    tops = [f for f in bm.faces if f.calc_center_median().y < TOP_Y and f.normal.y < -0.3]
    core = [f for f in tops if f.calc_center_median().y < CORE_Y]
    core_ids = {f.index for f in core}
    comp, comps = {}, []
    for f in core:
        if f.index in comp:
            continue
        cid = len(comps)
        q = deque([f])
        comp[f.index] = cid
        members = []
        while q:
            a = q.popleft()
            members.append(a)
            for e in a.edges:
                for b in e.link_faces:
                    if b.index in core_ids and b.index not in comp and a.normal.angle(b.normal, 0) < math.radians(SPLIT_DEG):
                        comp[b.index] = cid
                        q.append(b)
        comps.append(members)
    areas = [sum(f.calc_area() for f in m) for m in comps]
    order = np.argsort(areas)[::-1]
    big = [int(i) for i in order[:2]]
    cx = {i: float(np.mean([f.calc_center_median().x for f in comps[i]])) for i in big}
    red_id, green_id = (big[0], big[1]) if cx[big[0]] < cx[big[1]] else (big[1], big[0])
    poly_cls = np.zeros(len(bm.faces), np.int8)
    for i, m in enumerate(comps):
        if i == red_id:
            k = 1
        elif i == green_id:
            k = 2
        else:
            mx = np.mean([f.calc_center_median().x for f in m])
            k = 1 if abs(mx - cx[red_id]) < abs(mx - cx[green_id]) else 2
        for f in m:
            poly_cls[f.index] = k
    print("  core components", len(comps), "areas", [round(areas[i], 4) for i in order[:4]], "core faces red", int((poly_cls == 1).sum()), "green", int((poly_cls == 2).sum()))
    bm.free()
    return poly_cls


def raster_depth(P, tcls, W, H):
    """z-буфер вида спереди: минимальный y в каждом пикселе (inf там, где меша нет) и класс ядра победившего треугольника"""
    dx, dz = (X1 - X0) / W, (Z1 - Z0) / H
    zb = np.full((H, W), np.inf, np.float32)
    cb = np.zeros((H, W), np.int8)
    sx = (P[:, :, 0] - X0) / dx - 0.5
    sz = (P[:, :, 2] - Z0) / dz - 0.5
    for t in range(len(P)):
        ax, ay, bx, by, cx_, cy_ = sx[t, 0], sz[t, 0], sx[t, 1], sz[t, 1], sx[t, 2], sz[t, 2]
        den = (by - cy_) * (ax - cx_) + (cx_ - bx) * (ay - cy_)
        if abs(den) < 1e-9:
            continue
        i0, i1 = max(int(math.floor(min(ax, bx, cx_))), 0), min(int(math.ceil(max(ax, bx, cx_))), W - 1)
        j0, j1 = max(int(math.floor(min(ay, by, cy_))), 0), min(int(math.ceil(max(ay, by, cy_))), H - 1)
        if i1 < i0 or j1 < j0:
            continue
        gx, gz = np.meshgrid(np.arange(i0, i1 + 1), np.arange(j0, j1 + 1))
        l1 = ((by - cy_) * (gx - cx_) + (cx_ - bx) * (gz - cy_)) / den
        l2 = ((cy_ - ay) * (gx - cx_) + (ax - cx_) * (gz - cy_)) / den
        l3 = 1 - l1 - l2
        ins = (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
        if not ins.any():
            continue
        z = l1 * P[t, 0, 1] + l2 * P[t, 1, 1] + l3 * P[t, 2, 1]
        sub = zb[j0:j1 + 1, i0:i1 + 1]
        upd = ins & (z < sub)
        sub[upd] = z[upd]
        cb[j0:j1 + 1, i0:i1 + 1][upd] = tcls[t]
    return zb, cb


def watershed(D, mask, seeds):
    """заливка по глубине от ядер масок (спереди назад): метки встречаются в ложбине между масками"""
    import heapq
    H, W = D.shape
    lab = bytearray(H * W)
    Dl = D.ravel().tolist()
    Ml = mask.ravel().tolist()
    sflat = seeds.ravel()
    heap = [(Dl[i], i) for i in np.flatnonzero((sflat > 0) & mask.ravel()).tolist()]
    for _, i in heap:
        lab[i] = int(sflat[i])
    heapq.heapify(heap)
    pop, push = heapq.heappop, heapq.heappush
    while heap:
        d, i = pop(heap)
        l = lab[i]
        for j in (i - 1, i + 1, i - W, i + W):
            if 0 <= j < H * W and Ml[j] and not lab[j]:
                lab[j] = l
                push(heap, (Dl[j], j))
    return np.frombuffer(bytes(lab), np.uint8).reshape(H, W)


def spread(lab, n):
    """расширить метки на n пикселей (для стенок рядом с маской)"""
    out = lab.copy()
    for _ in range(n):
        for sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            cand = np.roll(out, sh[1], axis=sh[0])
            out = np.where(out == 0, cand, out)
    return out


def upsample(s, H, W):
    h, w = s.shape
    fx = np.clip((np.arange(W) + 0.5) / W * w - 0.5, 0, w - 1)
    i0 = np.floor(fx).astype(int)
    i1 = np.minimum(i0 + 1, w - 1)
    fr = (fx - i0)[None, :]
    a = s[:, i0] * (1 - fr) + s[:, i1] * fr
    fz = np.clip((np.arange(H) + 0.5) / H * h - 0.5, 0, h - 1)
    j0 = np.floor(fz).astype(int)
    j1 = np.minimum(j0 + 1, h - 1)
    fr = (fz - j0)[:, None]
    return a[j0] * (1 - fr) + a[j1] * fr


def paint_texture(obj, label):
    me = obj.data
    me.calc_loop_triangles()
    nv = len(me.vertices)
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(nv, 3)
    tri = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", tri)
    P = co[tri.reshape(-1, 3)]
    W2, H2 = RAST_W, RAST_H
    poly_cls = core_faces(obj)
    tri_poly = np.empty(len(me.loop_triangles), np.int32)
    me.loop_triangles.foreach_get("polygon_index", tri_poly)
    D, CB = raster_depth(P, poly_cls[tri_poly], W2, H2)
    A = np.isfinite(D)
    mask = A & (D < Y_EDGE)
    lab = watershed(D, mask, CB)
    XX = np.broadcast_to(X0 + (np.arange(W2)[None, :] + 0.5) / W2 * (X1 - X0), (H2, W2))
    rest = mask & (lab == 0)      # куски масок, не связанные с ядрами: по x
    lab = np.where(rest, np.where(XX < (XX[mask & (lab == 1)].max() + XX[mask & (lab == 2)].min()) / 2, 1, 2), lab).astype(np.uint8)
    is_red = mask & (lab == 1)
    is_grn = mask & (lab == 2)
    cxr = (XX[is_red].min() + XX[is_red].max()) / 2
    cxg = (XX[is_grn].min() + XX[is_grn].max()) / 2
    print("  tone split x: red %.3f green %.3f" % (cxr, cxg), " mask px", int(mask.sum()), "red", int(is_red.sum()), "green", int(is_grn.sum()), "unreached", int(rest.sum()))
    # ----- покраска по координатам вершины (как у JS-блока): палитра PAL x PAL, UV вершины = (u, v) -----
    # v = глубина: ниже 0.55 плита, выше - цвет маски; граница плита/маска = изолиния y = Y_EDGE (offset 0.05 на ней, до 0.45 глубже)
    # u = (T + S) / 0.6, оба слагаемых непрерывные функции положения вершины:
    #   T - тон: ступени 0 -> 0.15 -> 0.3 на двух наклонных линиях раздела тёмной/светлой половины (линии взяты с референса,
    #       маски наклонены, поэтому линии тона тоже наклонные),
    #   S - шов: ступень 0 -> 0.3 поперёк гладкой дуги шва, d - расстояние до дуги, полоса плиты в палитре даёт линию шва заданной ширины.
    # Все границы - изолинии непрерывных полей, поэтому они не зависят от рёбер треугольников.
    # --- дуга шва: левый контур зелёной маски (зелёная лежит поверх красной), построчно, затем сглаживание; линия шва стоит вплотную снаружи края
    labh = lab[::2, ::2]
    hz = Z0 + (np.arange(H2 // 2) + 0.5) / (H2 // 2) * (Z1 - Z0)
    hx = X0 + (np.arange(W2 // 2) + 0.5) / (W2 // 2) * (X1 - X0)
    zs_, xs_s = [], []
    for j in range(labh.shape[0]):
        gg = np.where(labh[j] == 2)[0]
        if len(gg) > 20:
            zs_.append(hz[j])
            xs_s.append(hx[int(gg.min())])
    zs_, xs_s = np.array(zs_), np.array(xs_s)
    def smooth_rows(a, k):
        pad = np.pad(a, (k, k), mode="edge")
        return np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode="valid")
    med = np.array([np.median(xs_s[max(i - 6, 0):i + 7]) for i in range(len(xs_s))])
    edge_x = smooth_rows(smooth_rows(med, 10), 10)
    edge_slope = np.gradient(edge_x, zs_)
    zc = np.clip(co[:, 2], zs_.min(), zs_.max())
    seam_x = np.interp(zc, zs_, edge_x) - SEAM_WIDTH / 2
    slope_v = np.interp(zc, zs_, edge_slope)
    dd = (co[:, 0] - seam_x) / np.sqrt(1 + slope_v ** 2)
    print("  seam arc along green left edge: %d rows, x %.3f..%.3f, z %.3f..%.3f" % (len(zs_), edge_x.min(), edge_x.max(), zs_.min(), zs_.max()))
    # --- наклонные линии тона: точки границы с референса переносим в координаты модели по границам масок
    mm = is_red | is_grn
    cols_m, rows_m = np.where(mm.any(0))[0], np.where(mm.any(1))[0]
    xm0, xm1 = X0 + (cols_m.min() + 0.5) / W2 * (X1 - X0), X0 + (cols_m.max() + 0.5) / W2 * (X1 - X0)
    zm0, zm1 = Z0 + (rows_m.min() + 0.5) / H2 * (Z1 - Z0), Z0 + (rows_m.max() + 0.5) / H2 * (Z1 - Z0)
    (xr0, xr1), (yr0, yr1) = REF_BOX
    def to_model(pts):
        zz_ = zm1 - (pts[:, 0] - yr0) / (yr1 - yr0) * (zm1 - zm0)
        xx_ = xm0 + (pts[:, 1] - xr0) / (xr1 - xr0) * (xm1 - xm0)
        return zz_, xx_
    lines = []
    for pts_ in (REF_PTS_R, REF_PTS_G):
        zz_, xx_ = to_model(pts_)
        B_, A_ = np.polyfit(zz_, xx_, 1)
        lines.append((A_, B_))
    print("  tone lines (x = A + B z): red A %.3f B %.3f | green A %.3f B %.3f" % (lines[0][0], lines[0][1], lines[1][0], lines[1][1]))
    xr_off = co[:, 0] - (lines[0][0] + lines[0][1] * co[:, 2])
    xg_off = co[:, 0] - (lines[1][0] + lines[1][1] * co[:, 2])
    ev = np.empty(len(me.edges) * 2, np.int32)
    me.edges.foreach_get("vertices", ev)
    ev = ev.reshape(-1, 2)
    sel = (co[ev[:, 0], 1] < Y_EDGE) & (co[ev[:, 1], 1] < Y_EDGE)
    Lmed = float(np.median(np.linalg.norm(co[ev[sel, 0]] - co[ev[sel, 1]], axis=1)))
    tone_band = max(TONE_BAND, 4.0 * Lmed)        # переходные зоны не уже ребра, иначе поле насыщается внутри треугольника
    ramp = max(0.04, 2.0 * Lmed)                  # полная ширина перехода шва
    frac = min(SEAM_WIDTH / ramp, 0.9)
    print("  median mask edge %.4f -> tone_band %.4f seam ramp %.4f line width %.4f" % (Lmed, tone_band, ramp, frac * ramp))
    T = 0.15 * np.clip(xr_off / tone_band + 0.5, 0, 1) + 0.15 * np.clip(xg_off / tone_band + 0.5, 0, 1)
    S = 0.3 * np.clip(0.5 + dd / ramp, 0, 1)
    u_v = np.clip((T + S) / 0.6, 0.01, 0.99)
    # вершины ложбины у шва, лежащие чуть мельче порога глубины, иначе дают тёмные «крошки» на шве: рядом с маской и швом считаем их глубиной маски
    lab_n = spread(lab[::2, ::2], 3)
    ixv = np.clip(((co[:, 0] - X0) / (X1 - X0) * (W2 // 2)).astype(int), 0, W2 // 2 - 1)
    izv = np.clip(((co[:, 2] - Z0) / (Z1 - Z0) * (H2 // 2)).astype(int), 0, H2 // 2 - 1)
    near_seam = (lab_n[izv, ixv] > 0) & (np.abs(dd) < 0.03) & (co[:, 1] < -0.038)      # плита лежит на y около -0.036: её вершины не трогаем
    y_eff = np.where(near_seam, np.minimum(co[:, 1], Y_EDGE - 0.012), co[:, 1])
    off = np.clip(0.05 + 0.4 * (Y_EDGE - y_eff) / EDGE_BAND, 0, 0.45)
    v_v = np.clip(0.5 + off, 0.01, 0.99)
    # --- палитра: столбцы по u (красная-тёмная | красная-светлая | линия шва | зелёная-светлая | зелёная-тёмная), строки по v (плита | маска)
    PAL = 512
    pal = np.empty((PAL, PAL, 4), np.float32)
    pal[..., 3] = 1
    r_split = int(PAL * 0.55)
    pal[:r_split, :, :3] = PLATE_C
    c0, c1 = int(PAL * 0.125), int(PAL * 0.875)
    l0, l1 = int(PAL * (0.5 - frac * 0.25)), int(PAL * (0.5 + frac * 0.25))
    pal[r_split:, :c0, :3] = RED_L
    pal[r_split:, c0:l0, :3] = RED_R
    pal[r_split:, l0:l1, :3] = PLATE_C
    pal[r_split:, l1:c1, :3] = GRN_L
    pal[r_split:, c1:, :3] = GRN_R
    tex = bpy.data.images.new(f"pw_pal_{label}", PAL, PAL, alpha=False)
    tex.pixels.foreach_set(pal.ravel())
    tex.pack()
    vi = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", vi)
    uv = np.stack([u_v[vi], v_v[vi]], axis=1).astype(np.float32)
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uvl = me.uv_layers.new(name="UVMap")
    uvl.data.foreach_set("uv", uv.ravel())
    m = bpy.data.materials.new(f"emblem_playwright_hy_tex_{label}")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = tex
    tn.interpolation = "Closest"
    tn.extension = "EXTEND"
    nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Metallic"].default_value = 0.0
    me.materials.clear()
    me.materials.append(m)


objs = []
for i, (label, path) in enumerate(JOBS):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    obj = new[0]
    obj.parent = None
    for e in [x for x in bpy.data.objects if x not in before and x is not obj]:
        bpy.data.objects.remove(e)
    obj.name = f"playwright_{label}"
    obj.data.name = obj.name
    while obj.data.color_attributes:
        obj.data.color_attributes.remove(obj.data.color_attributes[0])
    print(label, "tris", len(obj.data.polygons))
    paint_texture(obj, label)
    obj.location = (i * STEP, 0, 0)
    bpy.ops.object.text_add(location=(i * STEP, 0, 0.95), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object
    t.data.body = f"{label}  {len(obj.data.polygons)} tris"
    t.data.align_x = "CENTER"
    t.data.size = 0.12
    t.name = "label_" + label
    objs.append((label, obj))

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(35), 0, math.radians(-25))
coll.objects.link(sun)
wd = bpy.data.worlds.new("w")
wd.use_nodes = True
wd.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.8, 0.82, 1)
wd.node_tree.nodes["Background"].inputs[1].default_value = 0.7
sc.world = wd
for scr in bpy.data.screens:
    for area in scr.areas:
        if area.type == "VIEW_3D":
            sp = area.spaces.active
            sp.shading.type = "MATERIAL"
            sp.overlay.show_floor = False
            sp.overlay.show_axis_x = False
            sp.overlay.show_axis_y = False
            sp.overlay.show_cursor = False
            r3 = sp.region_3d
            r3.view_perspective = "ORTHO"
            r3.view_rotation = Euler((math.pi / 2, 0, 0)).to_quaternion()
            r3.view_location = Vector(((len(JOBS) - 1) * STEP / 2, 0.0, 0.0))
            r3.view_distance = 4.4 + (len(JOBS) - 1) * STEP * 0.9
bpy.ops.wm.save_as_mainfile(filepath=f"{OUTDIR}/emblem_playwright_hy_tex.blend")
print("SAVED")

# масштаб для сцены сайта: эмблемы на витринах имеют ширину около 0.8 (прежний emblem_playwright.glb: ±0.4), сетка Hunyuan получается шириной около 1.97
EXPORT_SCALE = float(os.environ.get("EXPORT_SCALE", "0.4057"))
for label, obj in objs:
    loc = obj.location.copy()
    obj.location = (0, 0, 0)
    obj.scale = (EXPORT_SCALE, EXPORT_SCALE, EXPORT_SCALE)
    for o in bpy.data.objects:
        o.select_set(o is obj)
    vl.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.export_scene.gltf(filepath=f"{OUTDIR}/{label}_tex.glb", export_format="GLB", use_selection=True, export_image_format="AUTO", export_apply=False)
    obj.location = loc
    print("EXPORTED", label)
