# Запуск: blender -b -P scripts/build_clean_emblem.py -- <next|playwright> [out.glb]
# Рецепт как у JS (scripts/build_clean_shield.py): чистая плита с круглой кромкой + оригинальные «поднятые» детали сверху
# (буквы/маски/кольцо из упрощённой нейросетевой сетки), покраска по координатам из палитры без проекции картинки.
#   next:       диск (симметричный), кольцо и N - оригинал; цвета по глубине, на N градиент из референса
#   playwright: плита по контуру оригинала, две маски - оригинал; красная и зелёная разделяются по геометрии, у каждой два тона
# Результат: assets-src/emblem_<name>_review.blend (оригинал, новая версия, эталон Figma) и, если задан out.glb, экспорт новой версии.
import bpy, bmesh, numpy as np, math, sys, struct, zlib
from collections import deque

ROOT = "D:/cursorTestProjects/mypage"
args = sys.argv[sys.argv.index("--") + 1:]
MODE = args[0]
OUT_GLB = args[1] if len(args) > 1 else None
PAL = 512

CFG = {
    "next": dict(y_front=-0.0536, y_back=0.0883, raised_top=-0.0552, raised_wall=-0.0515, thr_white=-0.0549, bevel=0.020, segs=5, x_off=-0.9),
    "playwright": dict(y_front=-0.0158, y_back=0.0414, raised_top=-0.0200, raised_wall=-0.0125, bevel=0.012, segs=4, x_off=-1.0),
}[MODE]
Y_FRONT, Y_BACK = CFG["y_front"], CFG["y_back"]
SINK = 0.0055   # основание деталей заглубляется в плиту, чтобы неровная нижняя кромка пряталась
MASK_SPLIT_DEG = 60   # Playwright: угол между соседними гранями, больше которого области масок считаются разными
CORE_Y = -0.0388      # Playwright: грани масок глубже этого y — «ядро» маски (мельче — ложбина между масками и кромка)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.name = f"Emblem_{MODE}_review"
coll = sc.collection
bpy.ops.import_scene.gltf(filepath=f"{ROOT}/assets-src/models/emblem_{MODE}.glb")
low = [o for o in sc.objects if o.type == "MESH"][0]
low.name = f"emblem_{MODE}_low"
bpy.context.view_layer.objects.active = low
for o in sc.objects:
    o.select_set(o == low)
md = low.modifiers.new("dec", "DECIMATE")
md.ratio = 0.15
bpy.ops.object.modifier_apply(modifier="dec")
while low.data.color_attributes:
    low.data.color_attributes.remove(low.data.color_attributes[0])
print("low tris", len(low.data.polygons))


def arr_co(me):
    n = len(me.vertices)
    a = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", a)
    return a.reshape(n, 3)


co = arr_co(low.data)
minx, maxx, miny, maxy = float(co[:, 0].min()), float(co[:, 0].max()), float(co[:, 1].min()), float(co[:, 1].max())
minz, maxz = float(co[:, 2].min()), float(co[:, 2].max())


def rdp(pts, eps):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    L = float(np.hypot(*ab))
    d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / L if L > 0 else np.hypot(pts[:, 0] - a[0], pts[:, 1] - a[1])
    i = int(np.argmax(d))
    if d[i] > eps:
        l = rdp(pts[: i + 1], eps)
        r = rdp(pts[i:], eps)
        return np.vstack([l[:-1], r])
    return np.vstack([a, b])


def png_bytes(a):
    h, w, _ = a.shape
    raw = b"".join(b"\x00" + a[i].tobytes() for i in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


# ---------- эталон: лист Figma, вид спереди ----------
ref_img = bpy.data.images.load(f"{ROOT}/assets-src/refs/ref_{MODE}.png")
RW, RH = ref_img.size
ref_px = np.array(ref_img.pixels[:], np.float32).reshape(RH, RW, 4)[::-1, :, :3]   # строка 0 - верх
ref_front = ref_px[: RH // 2, : RW // 2]


def ref_bg(c):
    return (c[..., 1] > 0.84) & (c[..., 0] < 0.3) & (c[..., 2] < 0.3)


# ---------- детали сверху: из оригинала ----------
bmS = bmesh.new()
bmS.from_mesh(low.data)
bmS.normal_update()
bmS.faces.ensure_lookup_table()


def is_raised(f):
    c = f.calc_center_median()
    if MODE == "next" and math.hypot(c.x, c.z) > 0.30:
        return False      # кольцо (r 0.340-0.356) строится заново, из оригинала берём только N
    return c.y < CFG["raised_top"] or (abs(f.normal.y) < 0.6 and c.y < CFG["raised_wall"])


bmesh.ops.delete(bmS, geom=[f for f in bmS.faces if not is_raised(f)], context="FACES")
bmesh.ops.delete(bmS, geom=[f for f in bmS.faces if all(v.co.y > Y_FRONT for v in f.verts)], context="FACES")   # целиком внутри плиты: не видны
for v in bmS.verts:
    if v.co.y > Y_FRONT:
        v.co.y = Y_FRONT + SINK
bmS.normal_update()
bmS.faces.ensure_lookup_table()
raised_tris = len(bmS.faces)
print("raised tris", raised_tris)

# метки слоёв для Playwright: красная (1) и зелёная (2) маска по геометрии
face_class = {}
split_x = {}
if MODE == "playwright":
    tops = [f for f in bmS.faces if f.calc_center_median().y < -0.0300]
    top_ids = {f.index for f in tops}
    # Красная и зелёная маски лежат на одной глубине (-0.0405) и образуют одну гладкую поверхность: геометрией по углу не разделить.
    # Но по шву между ними идёт неглубокая ложбина (около -0.037). Берём только «глубокие» грани: они распадаются на две области.
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
                    if b.index in core_ids and b.index not in comp and a.normal.angle(b.normal, 0) < math.radians(MASK_SPLIT_DEG):
                        comp[b.index] = cid
                        q.append(b)
        comps.append(members)
    areas = [sum(f.calc_area() for f in m) for m in comps]
    order = np.argsort(areas)[::-1]
    print("mask components:", len(comps), "top areas", [round(areas[i], 4) for i in order[:6]], "centroid x", [round(float(np.mean([f.calc_center_median().x for f in comps[i]])), 3) for i in order[:6]])
    big = [int(i) for i in order[:2]]
    cx = {i: float(np.mean([f.calc_center_median().x for f in comps[i]])) for i in big}
    red_id, green_id = (big[0], big[1]) if cx[big[0]] < cx[big[1]] else (big[1], big[0])
    cls_of_comp = {}
    for i, m in enumerate(comps):
        if i == red_id:
            cls_of_comp[i] = 1
        elif i == green_id:
            cls_of_comp[i] = 2
        else:
            mx = np.mean([f.calc_center_median().x for f in m])
            cls_of_comp[i] = 1 if abs(mx - cx[red_id]) < abs(mx - cx[green_id]) else 2
    for f in core:
        face_class[f.index] = cls_of_comp[comp[f.index]]
    # остальные верхние грани (ложбина между масками, кромка): метка от ближайшей размеченной грани, волной по соседям
    pending = [f for f in tops if f.index not in face_class]
    frontier = deque(f for f in core)
    while frontier:
        a = frontier.popleft()
        for e in a.edges:
            for b in e.link_faces:
                if b.index in top_ids and b.index not in face_class:
                    face_class[b.index] = face_class[a.index]
                    frontier.append(b)
    # стенки и прочее: класс берём у соседней лицевой грани, самой выступающей вперёд (наименьшее y)
    rest = [f for f in bmS.faces if f.index not in face_class]
    changed = True
    guard = 0
    while rest and changed and guard < 50:
        changed = False
        guard += 1
        left = []
        for f in rest:
            nbrs = [b for e in f.edges for b in e.link_faces if b is not f and b.index in face_class]
            if nbrs:
                best = min(nbrs, key=lambda b: b.calc_center_median().y)
                face_class[f.index] = face_class[best.index]
                changed = True
            else:
                left.append(f)
        rest = left
    for f in rest:
        face_class[f.index] = 1 if f.calc_center_median().x < (cx[red_id] + cx[green_id]) / 2 else 2
    for k in (1, 2):
        xs_ = [v.co.x for f in bmS.faces if face_class[f.index] == k for v in f.verts]
        split_x[k] = (min(xs_) + max(xs_)) / 2
    print("mask classes: red faces", sum(1 for v in face_class.values() if v == 1), "green faces", sum(1 for v in face_class.values() if v == 2), "split x", {k: round(v, 4) for k, v in split_x.items()})

# ---------- плита ----------
bm = bmesh.new()
if MODE == "next":
    R = 0.3754
    n = 96
    ring = [(R * math.cos(2 * math.pi * i / n + math.pi / n), R * math.sin(2 * math.pi * i / n + math.pi / n)) for i in range(n)]
    vf = [bm.verts.new((x, Y_FRONT, z)) for x, z in ring]
    vb = [bm.verts.new((x, Y_BACK, z)) for x, z in ring]
    cf = bm.verts.new((0, Y_FRONT, 0))
    cbk = bm.verts.new((0, Y_BACK, 0))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vf[j], vf[i], cf))      # лицевая сторона смотрит в -Y
        bm.faces.new((vb[i], vb[j], cbk))
        bm.faces.new((vf[i], vf[j], vb[j], vb[i]))
else:
    # контур плиты: верхняя и нижняя огибающие по x (одна полоса на каждый x)
    edges_x = np.linspace(minx, maxx, 201)
    xc, zt, zb = [], [], []
    for i in range(200):
        s = (co[:, 0] >= edges_x[i]) & (co[:, 0] < edges_x[i + 1] + (1e-9 if i == 199 else 0))
        if s.sum() >= 3:
            xc.append((edges_x[i] + edges_x[i + 1]) / 2)
            zt.append(co[s, 2].max())
            zb.append(co[s, 2].min())
    xc, zt, zb = np.array(xc), np.array(zt), np.array(zb)

    def med(a, w=5):
        p = np.pad(a, w // 2, mode="edge")
        return np.array([np.median(p[i:i + w]) for i in range(len(a))])
    zt, zb = med(zt), med(zb)
    # крайние столбцы содержат мало вершин и дают выбросы (чёрточка у края плиты): берём значение соседнего столбца
    for a_ in (zt, zb):
        a_[0], a_[1] = a_[2], a_[2]
        a_[-1], a_[-2] = a_[-3], a_[-3]
    up = rdp(np.c_[xc, zt], 0.0022)
    lo = rdp(np.c_[xc, zb], 0.0022)
    poly = [(minx, float(zb[0])), (minx, float(zt[0]))] + [(float(x), float(z)) for x, z in up[1:-1]] + [(maxx, float(zt[-1])), (maxx, float(zb[-1]))] + [(float(x), float(z)) for x, z in lo[::-1][1:-1]]
    clean = [poly[0]]
    for p in poly[1:]:
        if abs(p[0] - clean[-1][0]) > 1e-6 or abs(p[1] - clean[-1][1]) > 1e-6:
            clean.append(p)
    poly = clean
    area2 = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    if area2 < 0:
        poly = poly[::-1]
    print("plate outline points", len(poly))
    vf = [bm.verts.new((x, Y_FRONT, z)) for x, z in poly]
    vb = [bm.verts.new((x, Y_BACK, z)) for x, z in poly]
    k = len(poly)
    bm.faces.new(vf)
    bm.faces.new(vb[::-1])
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((vf[j], vf[i], vb[i], vb[j]))
bm.normal_update()
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method="BEAUTY", ngon_method="EAR_CLIP")
body_me = bpy.data.meshes.new("body")
bm.to_mesh(body_me)
bm.free()
body = bpy.data.objects.new("body", body_me)
coll.objects.link(body)
vl = bpy.context.view_layer


def select_only(ob):
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = ob
    ob.select_set(True)


select_only(body)
bv = body.modifiers.new("bev", "BEVEL")
bv.width = CFG["bevel"]
bv.segments = CFG["segs"]
bv.limit_method = "ANGLE"
bv.angle_limit = math.radians(30)
bv.use_clamp_overlap = False
bpy.ops.object.modifier_apply(modifier="bev")
tr = body.modifiers.new("tri", "TRIANGULATE")
tr.min_vertices = 4
bpy.ops.object.modifier_apply(modifier="tri")
if MODE == "next":
    bms = bmesh.new()
    bms.from_mesh(body.data)
    bmesh.ops.symmetrize(bms, input=list(bms.verts) + list(bms.edges) + list(bms.faces), direction="-X", dist=1e-5)
    bms.to_mesh(body.data)
    bms.free()
body.data.update()
cb = arr_co(body.data)
kb = {tuple(k_) for k_ in np.round(cb.astype(np.float64) * 1e5).astype(np.int64)}
sym = 100 * sum(1 for k_ in kb if (-k_[0], k_[1], k_[2]) in kb) / len(kb)
body_tris = len(body.data.polygons)
print("body tris", body_tris, "mirror-symmetric verts %.1f%%" % sym)

# ---------- кольцо Next: чистая окружность (r 0.340-0.356, высота 3.5 мм), основание уходит в плиту ----------
ring_ob = None
if MODE == "next":
    rb = bmesh.new()
    n = 96
    r_in, r_out, h_up, h_dn = 0.3400, 0.3555, 0.0035, 0.0020
    def rv(r, y):
        return [rb.verts.new((r * math.cos(2 * math.pi * i / n + math.pi / n), y, r * math.sin(2 * math.pi * i / n + math.pi / n))) for i in range(n)]
    top_in, top_out = rv(r_in, Y_FRONT - h_up), rv(r_out, Y_FRONT - h_up)
    bot_in, bot_out = rv(r_in, Y_FRONT + h_dn), rv(r_out, Y_FRONT + h_dn)
    for i in range(n):
        j = (i + 1) % n
        rb.faces.new((top_in[j], top_in[i], top_out[i], top_out[j]))        # верх, нормаль в -Y
        rb.faces.new((top_out[i], top_out[j], bot_out[j], bot_out[i]))      # наружная стенка
        rb.faces.new((top_in[j], top_in[i], bot_in[i], bot_in[j]))          # внутренняя стенка
    rb.normal_update()
    bmesh.ops.recalc_face_normals(rb, faces=rb.faces)
    ring_me = bpy.data.meshes.new("ring")
    rb.to_mesh(ring_me)
    rb.free()
    ring_ob = bpy.data.objects.new("ring", ring_me)
    coll.objects.link(ring_ob)
    select_only(ring_ob)
    rbv = ring_ob.modifiers.new("bev", "BEVEL")
    rbv.width = 0.0010
    rbv.segments = 2
    rbv.limit_method = "ANGLE"
    rbv.angle_limit = math.radians(30)
    bpy.ops.object.modifier_apply(modifier="bev")
    rtr = ring_ob.modifiers.new("tri", "TRIANGULATE")
    rtr.min_vertices = 4
    bpy.ops.object.modifier_apply(modifier="tri")
    print("ring tris", len(ring_me.polygons))

# ---------- детали -> объект, склейка ----------
raised_me = bpy.data.meshes.new("raised")
bmS.to_mesh(raised_me)
if MODE == "playwright":
    cls_attr = raised_me.attributes.new("mask_class", "INT", "FACE")
    for f in bmS.faces:
        cls_attr.data[f.index].value = face_class[f.index]
    body.data.attributes.new("mask_class", "INT", "FACE")
bmS.free()
raised = bpy.data.objects.new("raised", raised_me)
coll.objects.link(raised)
for o in vl.objects:
    o.select_set(False)
raised.select_set(True)
if ring_ob is not None:
    ring_ob.select_set(True)
body.select_set(True)
vl.objects.active = body
bpy.ops.object.join()
clean_ob = body
clean_ob.name = f"emblem_{MODE}_clean"
clean_ob.data.name = f"emblem_{MODE}_clean"
me = clean_ob.data
pn = len(me.polygons)
print("clean tris", pn)

# ---------- палитра и UV ----------
c2 = arr_co(me)
nor = np.empty(pn * 3, np.float32)
me.polygons.foreach_get("normal", nor)
nor = nor.reshape(pn, 3)
cen = np.empty(pn * 3, np.float32)
me.polygons.foreach_get("center", cen)
cen = cen.reshape(pn, 3)
vi_loops = np.empty(len(me.loops), np.int32)
me.loops.foreach_get("vertex_index", vi_loops)
loop_total = np.empty(pn, np.int32)
me.polygons.foreach_get("loop_total", loop_total)
poly_of_loop = np.repeat(np.arange(pn), loop_total)
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])
uvl = me.uv_layers.new(name="UVMap")
uv = np.zeros((len(me.loops), 2), np.float32)
lx = c2[vi_loops, 0]
ly = c2[vi_loops, 1]
lz = c2[vi_loops, 2]

if MODE == "next":
    THR = CFG["thr_white"]
    L, B = (236, 236, 240), (40, 40, 43)      # N и кольцо - белые; диск - почти чёрный
    H_TOT = PAL + 256                          # сверху PAL строк по глубине, ниже плитка 256x256 для градиента N
    arr = np.zeros((H_TOT, PAL, 3), np.uint8)
    ydepth = maxy - (np.arange(PAL) / (PAL - 1)) * (maxy - miny)
    for r in range(PAL):
        arr[r, :] = L if ydepth[r] < THR else B
    f = ref_front
    bg = ref_bg(f)
    ys_, xs_ = np.where(~bg)
    ccx, ccy = (xs_.min() + xs_.max()) / 2, (ys_.min() + ys_.max()) / 2
    rad = (xs_.max() - xs_.min()) / 2
    yy, xx = np.mgrid[0:f.shape[0], 0:f.shape[1]]
    inside = np.hypot(xx - ccx, yy - ccy) < 0.80 * rad
    core = (f.min(axis=2) > 0.72) & inside
    cy_, cx_ = np.where(core)
    x0, x1, y0, y1 = cx_.min(), cx_.max(), cy_.min(), cy_.max()
    side = max(x1 - x0, y1 - y0)
    x1 = max(x1, x0 + side)
    y1 = max(y1, y0 + side)
    print("N bbox in ref px", x0, x1, y0, y1)
    crop = f[y0:y1 + 1, x0:x1 + 1].mean(axis=2)
    # Градиент N в референсе простой: белая, затухает к нижнему правому углу (и конец диагонали, и низ правой палки).
    # Пиксели референса брать нельзя: у сгенерированной N сложная форма правой палки и заливка даёт полосатые артефакты.
    # Задаём формулой от положения: s = (u + v) / 2 (u вправо, v вниз в рамке N), белая до s ~ 0.56, к s ~ 0.98 почти чёрная.
    uu, vv = np.meshgrid((np.arange(256) + 0.5) / 256, (np.arange(256) + 0.5) / 256)
    s = 0.5 * (uu + vv)
    x_ = np.clip((s - 0.56) / (0.98 - 0.56), 0, 1)
    t = 1 - 0.92 * (x_ * x_ * (3 - 2 * x_))
    col = (np.array(B)[None, None, :] + (np.array(L) - np.array(B))[None, None, :] * t[..., None]).astype(np.uint8)
    arr[PAL:PAL + 256, :256] = col
    arr[PAL:PAL + 256, 256:] = L
    is_n_top = (nor[:, 1] < -0.3) & (cen[:, 1] < -0.0750)
    nverts = c2[np.unique(vi_loops[np.isin(poly_of_loop, np.where(is_n_top)[0])])]
    nminx, nmaxx = nverts[:, 0].min(), nverts[:, 0].max()
    nminz, nmaxz = nverts[:, 2].min(), nverts[:, 2].max()
    side_m = max(nmaxx - nminx, nmaxz - nminz)
    uv[:, 0] = 0.25
    uv[:, 1] = 1 - ((0.0005 + 0.999 * ((maxy - ly) / (maxy - miny))) * PAL) / H_TOT
    ln = is_n_top[poly_of_loop]
    if ln.any():
        tu = np.clip((lx[ln] - nminx) / side_m, 0.01, 0.99)
        tv = np.clip((nmaxz - lz[ln]) / side_m, 0.01, 0.99)
        uv[ln, 0] = tu * (256 / PAL)
        uv[ln, 1] = 1 - (PAL + tv * 256) / H_TOT
    img_arr = arr
else:
    f = ref_front
    bg = ref_bg(f)
    r_, g_, b_ = f[..., 0], f[..., 1], f[..., 2]
    red = (r_ > g_ + 0.15) & (r_ > b_ + 0.15) & ~bg
    green = (g_ > r_ + 0.10) & (g_ > b_ + 0.10) & ~bg
    plate = (~bg) & ~red & ~green
    ys_r, xs_r = np.where(red)
    ys_g, xs_g = np.where(green)

    def tones(mask, xs_m):
        mid = (xs_m.min() + xs_m.max()) / 2
        xx = np.arange(f.shape[1])[None, :]
        lm = mask & (xx < mid - 4)
        rm = mask & (xx > mid + 4)
        return tuple(int(v * 255) for v in np.median(f[lm], axis=0)), tuple(int(v * 255) for v in np.median(f[rm], axis=0))
    red_l, red_r = tones(red, xs_r)
    grn_l, grn_r = tones(green, xs_g)
    # подложка: берём светлую часть синих пикселей (без тёмной окантовки и теней у масок), иначе цвет выходит слишком тёмным
    pm_ = plate & (f[..., 2] > f[..., 0])
    lum_ = f.mean(axis=2)
    lo_, hi_ = np.percentile(lum_[pm_], [50, 92])
    plate_c = tuple(int(v * 255) for v in np.median(f[pm_ & (lum_ >= lo_) & (lum_ <= hi_)], axis=0))
    print("tones: red", red_l, red_r, "green", grn_l, grn_r, "plate", plate_c)
    arr = np.zeros((PAL, PAL, 3), np.uint8)
    q = PAL // 4
    arr[0:q] = plate_c
    arr[q:2 * q, :PAL // 2] = red_l
    arr[q:2 * q, PAL // 2:] = red_r
    arr[2 * q:3 * q, :PAL // 2] = grn_l
    arr[2 * q:3 * q, PAL // 2:] = grn_r
    arr[3 * q:] = plate_c
    attr = me.attributes.get("mask_class")
    vals = np.empty(pn, np.int32)
    attr.data.foreach_get("value", vals)     # 0 - плита, 1 - красная, 2 - зелёная
    row_c = np.array([0.125, 0.375, 0.625], np.float32)
    cls_l = vals[poly_of_loop]
    v = row_c[cls_l]
    sx = np.where(cls_l == 1, split_x[1], np.where(cls_l == 2, split_x[2], 0.0))
    u = np.clip(0.5 + (lx - sx) / 1.0, 0.02, 0.98).astype(np.float32)
    u = np.where(cls_l == 0, 0.25, u)
    uv[:, 0] = u
    uv[:, 1] = 1 - v
    img_arr = arr

uvl.data.foreach_set("uv", uv.ravel())
pal_path = f"{ROOT}/assets-src/palette_{MODE}.png"
open(pal_path, "wb").write(png_bytes(img_arr))
img = bpy.data.images.load(pal_path)
img.reload()
img.pack()
mat = bpy.data.materials.new(f"emblem_{MODE}_mat")
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tn = nt.nodes.new("ShaderNodeTexImage")
tn.image = img
tn.interpolation = "Closest"
tn.extension = "EXTEND"
nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.8
bsdf.inputs["Metallic"].default_value = 0.0
me.materials.clear()
me.materials.append(mat)
if me.attributes.get("mask_class"):
    me.attributes.remove(me.attributes.get("mask_class"))

# ---------- затенение ----------
select_only(clean_ob)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
pn = len(me.polygons)
nor = np.empty(pn * 3, np.float32)
me.polygons.foreach_get("normal", nor)
nor = nor.reshape(pn, 3)
cen = np.empty(pn * 3, np.float32)
me.polygons.foreach_get("center", cen)
cen = cen.reshape(pn, 3)
flat = (np.abs(nor[:, 1]) > 0.9995) & ((np.abs(cen[:, 1] - Y_FRONT) < 1e-5) | (np.abs(cen[:, 1] - Y_BACK) < 1e-5))
smooth = np.array([p.use_smooth for p in me.polygons], bool)
smooth[flat] = False
me.polygons.foreach_set("use_smooth", smooth)
me.update()
clean_ob.location = (CFG["x_off"], 0, 0)

# ---------- эталон рядом ----------
hh = (maxz - minz) / 2
hw = hh * 1.5
pm = bpy.data.meshes.new("ref_plane")
pm.from_pydata([(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)], [], [(0, 1, 2, 3)])
puv = pm.uv_layers.new(name="UVMap")
for i, (a_, b_) in enumerate([(0, 0.5), (0.5, 0.5), (0.5, 1), (0, 1)]):
    puv.data[i].uv = (a_, b_)
plane = bpy.data.objects.new("REFERENCE_figma", pm)
coll.objects.link(plane)
plane.location = (maxx + hw + 0.25, 0, (minz + maxz) / 2)
rm = bpy.data.materials.new("ref_mat")
rm.use_nodes = True
rn = rm.node_tree
for n_ in list(rn.nodes):
    if n_.type != "OUTPUT_MATERIAL":
        rn.nodes.remove(n_)
tx = rn.nodes.new("ShaderNodeTexImage")
tx.image = ref_img
em = rn.nodes.new("ShaderNodeEmission")
rn.links.new(tx.outputs["Color"], em.inputs["Color"])
out_n = next(n_ for n_ in rn.nodes if n_.type == "OUTPUT_MATERIAL")
rn.links.new(em.outputs["Emission"], out_n.inputs["Surface"])
pm.materials.append(rm)

cam = bpy.data.objects.new("review_cam", bpy.data.cameras.new("review_cam"))
coll.objects.link(cam)
sc.camera = cam
for name, loc, e in [("key", (-1.5, -2.5, 2.0), 120), ("fill", (2.5, -2.0, 0.5), 50)]:
    lt = bpy.data.lights.new(name, "AREA")
    lt.energy = e
    lt.size = 2.0
    lo = bpy.data.objects.new(name, lt)
    lo.location = loc
    coll.objects.link(lo)
wd = bpy.data.worlds.new("w")
wd.use_nodes = True
wd.node_tree.nodes["Background"].inputs[0].default_value = (0.12, 0.12, 0.13, 1)
sc.world = wd
print("RESULT", MODE, "tris", pn, "raised", raised_tris, "body", body_tris, "sym %.1f" % sym)
bpy.ops.wm.save_as_mainfile(filepath=f"{ROOT}/assets-src/emblem_{MODE}_review.blend")
print("SAVED")

if OUT_GLB:
    keep = clean_ob
    keep.location = (0, 0, 0)
    tmp = bpy.data.scenes.new("export_tmp")
    tmp.collection.objects.link(keep)
    for o in list(bpy.data.objects):
        if o is not keep:
            bpy.data.objects.remove(o, do_unlink=True)
    if bpy.context.window:
        bpy.context.window.scene = tmp
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", use_selection=False, export_image_format="AUTO", export_apply=False)
    print("EXPORTED", OUT_GLB)
