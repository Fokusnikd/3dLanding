# Запуск: blender -b assets-src/emblem_js_review.blend -P scripts/build_clean_shield.py
# Собирает две чистые симметричные плиты щита (половина -> выдавливание -> зеркало -> фаска) с оригинальными буквами:
#   shield_from_figma   - контур и толщина по референсу из Figma (assets-src/refs/ref_js.png)
#   shield_from_current - контур и толщина, снятые с текущего объекта emblem_js_low
import bpy, bmesh, numpy as np, math

REF = "D:/cursorTestProjects/mypage/assets-src/refs/ref_js.png"
LETTER_FACE_Y = -0.058
Y_FRONT = -0.0530            # лицевая плоскость щита: у оригинала она слегка выпуклая (-0.049 по краям, -0.055 у букв), берём уровень оснований букв
BEVEL = 0.022                # радиус скругления кромки: по сечению оригинала (сужение 9.9 мм на глубине 4 мм) это круг r ≈ 22 мм, и спереди, и сзади
BEVEL_SEGMENTS = 5
THR_L = -0.0538              # глубже этого y — буква (палитра покраски), мельче — щит; плоскость щита лежит чуть глубже порога
THR_B = 0.0854               # у задней плоскости — цвет тыла
PALETTE_SIZE = 512           # сторона текстуры-палитры в пикселях
minx, maxx, miny, maxy = -0.32743823528289795, 0.3274596929550171, -0.08882222324609756, 0.08882073312997818

src = bpy.data.objects["emblem_js_low"]
sc = bpy.data.scenes["EmblemJS_review"]
coll = bpy.data.collections["emblem_js_work"]
vl = sc.view_layers[0]
if bpy.context.window:
    bpy.context.window.scene = sc

n = len(src.data.vertices)
co = np.empty(n * 3, np.float32)
src.data.vertices.foreach_get("co", co)
co = co.reshape(n, 3)
minz, maxz = float(co[:, 2].min()), float(co[:, 2].max())
Y_BACK_CUR = 0.0881
T_CUR = Y_BACK_CUR - Y_FRONT


def png_bytes(a):
    import struct, zlib
    h, w, _ = a.shape
    raw = b"".join(b"\x00" + a[i].tobytes() for i in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def rebuild_palette():
    # палитра PALETTE_SIZE x PALETTE_SIZE: u - x модели, v - глубина y; границы - ровные линии, не зависят от треугольников.
    # 512 строк на 178 мм толщины - это 0.35 мм на строку, для пяти плоских цветов этого достаточно (2048 давало 22 МБ видеопамяти вместо 1.4)
    W2 = PALETTE_SIZE
    L, R, J, S, B = (241, 176, 13), (250, 199, 31), (36, 34, 35), (231, 229, 230), (243, 180, 14)
    ydepth = maxy - (np.arange(W2) / (W2 - 1)) * (maxy - miny)
    arr = np.zeros((W2, W2, 3), np.uint8)
    for r in range(W2):
        y = ydepth[r]
        if y < THR_L:
            arr[r, :W2 // 2] = J
            arr[r, W2 // 2:] = S
        elif y > THR_B:
            arr[r, :] = B
        else:
            arr[r, :W2 // 2] = L
            arr[r, W2 // 2:] = R
    path = "D:/cursorTestProjects/mypage/assets-src/palette_js_coord.png"
    open(path, "wb").write(png_bytes(arr[::-1]))
    img = bpy.data.images.load(path)
    img.reload()
    img.pack()
    node = next(n for n in bpy.data.materials["emblem_js_mat"].node_tree.nodes if n.type == "TEX_IMAGE")
    node.image = img


rebuild_palette()


def rdp(pts, eps):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    L = float(np.hypot(*ab))
    if L > 0:
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / L
    else:
        d = np.hypot(pts[:, 0] - a[0], pts[:, 1] - a[1])
    i = int(np.argmax(d))
    if d[i] > eps:
        l = rdp(pts[: i + 1], eps)
        r = rdp(pts[i:], eps)
        return np.vstack([l[:-1], r])
    return np.vstack([a, b])


# ---------- контур 1: из референса Figma ----------
img = bpy.data.images.load(REF)
W, H = img.size
px = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[::-1, :, :3]   # строка 0 - верх
front = px[: H // 2, : W // 2]
side = px[: H // 2, W // 2:]


def is_bg(c):
    return (c[..., 1] > 0.84) & (c[..., 0] < 0.3) & (c[..., 2] < 0.3)


m = ~is_bg(front)
for _ in range(2):
    p = np.pad(m, 1, constant_values=False)
    m = m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
rows = np.where(m.any(1))[0]
r0, r1 = rows.min(), rows.max()
hw_px = []
for r in range(r0, r1 + 1):
    xs = np.where(m[r])[0]
    hw_px.append((xs.max() - xs.min() + 1) / 2 if len(xs) else 0)
hw_px = np.array(hw_px)
hw_cur = (maxx - minx) / 2
zs_fig = np.linspace(maxz, minz, len(hw_px))
xs_fig = hw_px / hw_px.max() * hw_cur
# толщина плиты из бокового вида: жёлтая область
sm = ~is_bg(side)
yel = sm & (side[..., 0] > 0.75) & (side[..., 1] > 0.45) & (side[..., 2] < 0.35)
cols = np.where(yel.any(0))[0]
srows = np.where(sm.any(1))[0]
ratio = (cols.max() - cols.min() + 1) / (srows.max() - srows.min() + 1)
T_FIG = float(ratio * (maxz - minz))
print("figma: thickness ratio %.3f -> T %.4f m (current %.4f)" % (ratio, T_FIG, T_CUR))

# ---------- контур 2: с текущего объекта ----------
bins = np.linspace(minz, maxz, 161)
zc, hw = [], []
for i in range(len(bins) - 1):
    hi = bins[i + 1] + (1e-9 if i == len(bins) - 2 else 0)
    sel = (co[:, 2] >= bins[i]) & (co[:, 2] < hi)
    if sel.any():
        zc.append((bins[i] + bins[i + 1]) / 2)
        hw.append((co[sel, 0].max() - co[sel, 0].min()) / 2)
zc = np.array(zc)[::-1]
hw = np.array(hw)[::-1]     # сверху вниз


def smooth_width(h, win=9):
    # шум сетки даёт зигзаги по бокам: медианный фильтр по высоте убирает выбросы, затем лёгкое усреднение
    pad = win // 2
    p = np.pad(h, pad, mode="edge")
    med = np.array([np.median(p[i:i + win]) for i in range(len(h))])
    p2 = np.pad(med, 2, mode="edge")
    return np.array([p2[i:i + 5].mean() for i in range(len(h))])


hw = smooth_width(hw)


def half_outline(z, h, eps=0.0015):
    # половина контура (x >= 0): сверху по центру, вниз по правому краю, до острия на оси
    pts = [(0.0, maxz)] + [(float(a), float(b)) for a, b in zip(h, z)] + [(0.0, minz)]
    pts = np.array(pts)
    pts[1, 1] = maxz
    pts[-2, 1] = minz
    return rdp(pts, eps)


def build(name, outline, T, x_off):
    pts = outline.copy()
    pts[0, 0] = 0.0
    pts[-1, 0] = 0.0
    bm = bmesh.new()
    yf, yb = Y_FRONT, Y_FRONT + T
    vf = [bm.verts.new((float(x), yf, float(z))) for x, z in pts]
    vb = [bm.verts.new((float(x), yb, float(z))) for x, z in pts]
    k = len(pts)
    bm.faces.new(vf[::-1])         # лицевая грань (нормаль к -Y)
    bm.faces.new(vb)               # задняя грань
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((vf[i], vf[j], vb[j], vb[i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method="BEAUTY", ngon_method="EAR_CLIP")
    # зеркало по X со сваркой на оси
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.mirror(bm, geom=geom, axis="X", merge_dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name + "_body")
    bm.to_mesh(me)
    bm.free()
    body = bpy.data.objects.new(name + "_body", me)
    coll.objects.link(body)
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = body
    body.select_set(True)
    bv = body.modifiers.new("bev", "BEVEL")
    bv.width = BEVEL
    bv.segments = BEVEL_SEGMENTS
    bv.use_clamp_overlap = False    # иначе короткие рёбра контура зажимают фаску до ~3 мм вместо 13
    bv.limit_method = "ANGLE"
    bv.angle_limit = math.radians(30)
    bpy.ops.object.modifier_apply(modifier="bev")
    tr = body.modifiers.new("tri", "TRIANGULATE")
    tr.min_vertices = 4
    bpy.ops.object.modifier_apply(modifier="tri")
    # фаска без ограничения даёт несимметричную раскладку по треугольникам: симметризуем (копируем половину x>0 на x<0)
    bms = bmesh.new()
    bms.from_mesh(body.data)
    bmesh.ops.symmetrize(bms, input=list(bms.verts) + list(bms.edges) + list(bms.faces), direction="-X", dist=1e-5)
    bms.to_mesh(body.data)
    bms.free()
    body.data.update()
    # симметрия самого тела (до присоединения букв): для каждой вершины есть вершина с -x
    bme = body.data
    nb = len(bme.vertices)
    cb = np.empty(nb * 3, np.float32)
    bme.vertices.foreach_get("co", cb)
    cb = cb.reshape(nb, 3)
    kb = {tuple(kk) for kk in np.round(cb.astype(np.float64) * 1e5).astype(np.int64)}
    sym = 100 * sum(1 for kk in kb if (-kk[0], kk[1], kk[2]) in kb) / len(kb)
    body_tris = len(bme.polygons)
    # буквы: грани оригинала глубже LETTER_FACE_Y
    bmS = bmesh.new()
    bmS.from_mesh(src.data)
    bmS.faces.ensure_lookup_table()
    # буквы: сами буквы (центр глубже LETTER_FACE_Y) плюс боковые грани их оснований (они тоже стенки букв).
    # Плоскость щита и скругление кромки сюда не попадают: у них нормаль смотрит вперёд или они лежат мельче -0.0505.
    def is_letter_face(f):
        cy = f.calc_center_median().y
        return cy < LETTER_FACE_Y or (abs(f.normal.y) < 0.6 and cy < -0.0505)
    bmS.normal_update()
    bmesh.ops.delete(bmS, geom=[f for f in bmS.faces if not is_letter_face(f)], context="FACES")
    # грани, целиком лежащие глубже поверхности плиты, не видны: удаляем (иначе лишние тысячи треугольников)
    bmesh.ops.delete(bmS, geom=[f for f in bmS.faces if all(v.co.y > Y_FRONT for v in f.verts)], context="FACES")
    # низ букв обрывался неровно и «висел» над плитой: заглубляем основание внутрь плиты, видимая часть букв не меняется
    for v in bmS.verts:
        if v.co.y > Y_FRONT:
            v.co.y = Y_FRONT + 0.0055
    ml = bpy.data.meshes.new(name + "_letters")
    bmS.to_mesh(ml)
    bmS.free()
    letters = bpy.data.objects.new(name + "_letters", ml)
    coll.objects.link(letters)
    for o in vl.objects:
        o.select_set(False)
    letters.select_set(True)
    body.select_set(True)
    vl.objects.active = body
    bpy.ops.object.join()
    ob = body
    ob.name = name
    ob.data.name = name
    me = ob.data
    nv = len(me.vertices)
    c2 = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get("co", c2)
    c2 = c2.reshape(nv, 3)
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uvl = me.uv_layers.new(name="UVMap")
    vi = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", vi)
    u = 0.0005 + 0.999 * (c2[vi, 0] - minx) / (maxx - minx)
    v = 0.0005 + 0.999 * (maxy - c2[vi, 1]) / (maxy - miny)
    uvl.data.foreach_set("uv", np.stack([u, v], 1).astype(np.float32).ravel())
    me.materials.clear()
    me.materials.append(bpy.data.materials["emblem_js_mat"])
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    pn = len(me.polygons)
    nor = np.empty(pn * 3, np.float32)
    me.polygons.foreach_get("normal", nor)
    nor = nor.reshape(pn, 3)
    cen = np.empty(pn * 3, np.float32)
    me.polygons.foreach_get("center", cen)
    cen = cen.reshape(pn, 3)
    flat = (np.abs(nor[:, 1]) > 0.9995) & (cen[:, 1] > LETTER_FACE_Y)
    smooth = np.array([p.use_smooth for p in me.polygons], bool)
    smooth[flat] = False
    me.polygons.foreach_set("use_smooth", smooth)
    me.update()
    ob.location = (x_off, 0, 0)
    print(name, "tris total", pn, "| body tris", body_tris, "body verts", len(kb), "mirror-symmetric verts %.1f%%" % sym, "| thickness", round(T, 4), "flat faces", int(flat.sum()))
    return ob


for old in ("shield_from_figma", "shield_from_current"):
    o = bpy.data.objects.get(old)
    if o:
        d = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if d.users == 0:
            bpy.data.meshes.remove(d)
fig_outline = half_outline(zs_fig, xs_fig)
cur_outline = half_outline(zc, hw, eps=0.0035)   # у текущей сетки контур шумный: допуск упрощения крупнее
print("outline points: figma", len(fig_outline), "current", len(cur_outline))
build("shield_from_figma", fig_outline, T_FIG, -1.6)
build("shield_from_current", cur_outline, T_CUR, -2.4)
bpy.ops.wm.save_as_mainfile(filepath="D:/cursorTestProjects/mypage/assets-src/emblem_js_review.blend")
print("SAVED")

# Необязательный экспорт выбранного варианта: ... -P scripts/build_clean_shield.py -- <out.glb> [shield_from_current|shield_from_figma]
import sys
if "--" in sys.argv:
    extra = sys.argv[sys.argv.index("--") + 1:]
    if extra:
        export_path = extra[0]
        which = extra[1] if len(extra) > 1 else "shield_from_current"
        keep = bpy.data.objects[which]
        keep.location = (0, 0, 0)          # в начале координат, как исходная эмблема
        tmp = bpy.data.scenes.new("export_tmp")
        tmp.collection.objects.link(keep)
        for o in list(bpy.data.objects):
            if o is not keep:
                bpy.data.objects.remove(o, do_unlink=True)
        if bpy.context.window:
            bpy.context.window.scene = tmp
        bpy.ops.export_scene.gltf(filepath=export_path, export_format="GLB", use_selection=False, export_image_format="AUTO", export_apply=False)
        print("EXPORTED", which, export_path)
