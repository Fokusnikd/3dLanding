# Запуск: blender -b -P scripts/build_playwright_from_ref.py -- [out.glb]
# Playwright по референсу Figma (assets-src/refs/ref_playwright.png), без сгенерированной сетки:
#   - контуры плиты и двух масок (с отверстиями глаз и рта) берутся из вида спереди (сегментация по цвету, marching squares);
#   - высоты слоёв берутся из вида сбоку: плита 54 px, красная маска +40 px, зелёная +74 px над плитой (глубина ~180 мм, как у JS и Next);
#   - кромки скруглены (Bevel), цвета и тона масок из референса, покраска по классам через палитру 512x512.
# Результат: assets-src/emblem_playwright_fromref.blend (новая версия, оригинал-контроль, эталон Figma) и, если задан out.glb, экспорт.
import bpy, bmesh, numpy as np, math, sys, struct, zlib
from mathutils import Vector, Euler

ROOT = "D:/cursorTestProjects/mypage"
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_GLB = args[0] if args else None
PAL = 512

# ---------- референс ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.name = "Playwright_fromref"
coll = sc.collection
vl = bpy.context.view_layer
ref_img = bpy.data.images.load(f"{ROOT}/assets-src/refs/ref_playwright.png")
RW, RH = ref_img.size
px = np.array(ref_img.pixels[:], np.float32).reshape(RH, RW, 4)[::-1, :, :3]   # строка 0 - верх
front = px[: RH // 2, : RW // 2]
H, W = front.shape[:2]

r_, g_, b_ = front[..., 0], front[..., 1], front[..., 2]
bg = (g_ > 0.84) & (r_ < 0.3) & (b_ < 0.3)
red = (r_ > g_ + 0.15) & (r_ > b_ + 0.15) & ~bg
green = (g_ > r_ + 0.10) & (g_ > b_ + 0.10) & ~bg
# 0 - фон, 1 - плита, 2 - красная, 3 - зелёная
label = np.ones((H, W), np.int8)
label[red] = 2
label[green] = 3
label[bg] = 0


def shift_or(m):
    p = np.pad(m, 1, constant_values=False)
    return m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]


# каёмка у фона смешана с зелёным ключом: пиксели в 2 px от фона перекрашиваем по ближайшему внутреннему пикселю
near_bg = bg.copy()
for _ in range(2):
    near_bg = shift_or(near_bg)
unknown = near_bg & ~bg
label[unknown] = -1
for _ in range(6):
    miss = label == -1
    if not miss.any():
        break
    pl = np.pad(label, 1, constant_values=-1)
    cand = np.stack([pl[:-2, 1:-1], pl[2:, 1:-1], pl[1:-1, :-2], pl[1:-1, 2:]])
    fill = np.full((H, W), -1, np.int8)
    for k in range(4):
        take = (fill == -1) & (cand[k] > 0)
        fill[take] = cand[k][take]
    label[miss & (fill > 0)] = fill[miss & (fill > 0)]
label[label == -1] = 1


def majority(lab, passes=2):
    out = lab.copy()
    for _ in range(passes):
        p = np.pad(out, 1, mode="edge")
        stack = np.stack([p[dy:dy + H, dx:dx + W] for dy in range(3) for dx in range(3)])
        cnt = np.stack([(stack == k).sum(0) for k in range(4)])
        out = cnt.argmax(0).astype(np.int8)
    return out


label = majority(label, 1)
solid = label > 0
ys, xs = np.where(solid)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
SCALE = 0.8 / (x1 - x0 + 1)                    # метров на пиксель, ширина эмблемы 0.8 м как у оригинала
CX, CY = (x0 + x1) / 2, (y0 + y1) / 2
print("front silhouette px", x1 - x0 + 1, "x", y1 - y0 + 1, "-> %.3f x %.3f m" % ((x1 - x0 + 1) * SCALE, (y1 - y0 + 1) * SCALE))

# глубины слоёв (вид сбоку, пиксели): плита 54, красная +40, зелёная +74 над плитой
PLATE_T, RED_H, GREEN_H = 54 * SCALE, 40 * SCALE, 74 * SCALE
Y_BACK = (PLATE_T + GREEN_H) / 2               # центрируем по глубине
Y_PLATE_FRONT = Y_BACK - PLATE_T
Y_RED = Y_PLATE_FRONT - RED_H
Y_GREEN = Y_PLATE_FRONT - GREEN_H
print("depths: back %.4f plate front %.4f red %.4f green %.4f" % (Y_BACK, Y_PLATE_FRONT, Y_RED, Y_GREEN))


# ---------- контуры: marching squares по размытой маске ----------
def blur(a, n=2):
    a = a.astype(np.float32)
    for _ in range(n):
        p = np.pad(a, 1, mode="edge")
        a = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 4 * a) / 8
    return a


def contours(field, level=0.5):
    ins = field >= level
    tl, tr = ins[:-1, :-1], ins[:-1, 1:]
    bl, br = ins[1:, :-1], ins[1:, 1:]
    code = tl * 8 + tr * 4 + br * 2 + bl * 1
    table = {1: [("L", "B")], 2: [("B", "R")], 3: [("L", "R")], 4: [("T", "R")], 6: [("T", "B")], 7: [("T", "L")], 8: [("T", "L")],
             9: [("T", "B")], 11: [("T", "R")], 12: [("L", "R")], 13: [("B", "R")], 14: [("L", "B")]}
    pts = {}

    def edge_pt(kind, i, j):
        key = (kind, i, j)
        if key in pts:
            return key
        if kind == "h":
            a, b = field[i, j], field[i, j + 1]
            t = (level - a) / (b - a) if b != a else 0.5
            pts[key] = (j + t, float(i))
        else:
            a, b = field[i, j], field[i + 1, j]
            t = (level - a) / (b - a) if b != a else 0.5
            pts[key] = (float(j), i + t)
        return key
    adj = {}
    for i, j in np.argwhere((code != 0) & (code != 15)):
        c = int(code[i, j])
        names = {"T": ("h", i, j), "B": ("h", i + 1, j), "L": ("v", i, j), "R": ("v", i, j + 1)}
        if c in (5, 10):
            center = field[i:i + 2, j:j + 2].mean() >= level
            if c == 5:
                segs = [("T", "R"), ("L", "B")] if center else [("T", "L"), ("B", "R")]
            else:
                segs = [("T", "L"), ("B", "R")] if center else [("T", "R"), ("L", "B")]
        else:
            segs = table[c]
        for a, b in segs:
            ka, kb = edge_pt(*names[a]), edge_pt(*names[b])
            adj.setdefault(ka, []).append(kb)
            adj.setdefault(kb, []).append(ka)
    loops, seen = [], set()
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [], None, start
        while True:
            seen.add(cur)
            loop.append(pts[cur])
            nxt = [n for n in adj[cur] if n != prev and (n not in seen or n == start)]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            if cur == start:
                break
        if len(loop) >= 8:
            loops.append(np.array(loop))
    return loops


def rdp(p, eps):
    p = np.asarray(p, float)
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    ab = b - a
    L = float(np.hypot(*ab))
    d = np.abs(ab[0] * (p[:, 1] - a[1]) - ab[1] * (p[:, 0] - a[0])) / L if L > 0 else np.hypot(p[:, 0] - a[0], p[:, 1] - a[1])
    i = int(np.argmax(d))
    if d[i] > eps:
        l, r = rdp(p[: i + 1], eps), rdp(p[i:], eps)
        return np.vstack([l[:-1], r])
    return np.vstack([a, b])


def simplify_loop(loop, eps=1.0):
    i1 = int(np.argmax(np.hypot(*(loop - loop[0]).T)))
    a = rdp(loop[: i1 + 1], eps)
    b = rdp(np.vstack([loop[i1:], loop[:1]]), eps)
    return np.vstack([a[:-1], b[:-1]])


def smooth_loop(p, iters=2):
    # срезание углов замкнутого контура (Chaikin): плавные края вместо ломаных после упрощения
    for _ in range(iters):
        q = np.roll(p, -1, axis=0)
        out = np.empty((len(p) * 2, 2))
        out[0::2] = 0.75 * p + 0.25 * q
        out[1::2] = 0.25 * p + 0.75 * q
        p = out
    return p


def point_in_poly(pt, poly):
    x, y = pt
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def lap_smooth(p, n=3):
    # усреднение с соседями по замкнутому контуру: убирает неровности, форма эллипса сохраняется
    for _ in range(n):
        p = 0.5 * p + 0.25 * (np.roll(p, 1, axis=0) + np.roll(p, -1, axis=0))
    return p


def layer_loops(mask, eps=0.8, min_area=40):
    f = blur(mask, 2)
    cand = []
    for lp in contours(f, 0.5):
        s = smooth_loop(simplify_loop(lp, eps), 1)
        a = 0.5 * abs(sum(s[i, 0] * s[(i + 1) % len(s), 1] - s[(i + 1) % len(s), 0] * s[i, 1] for i in range(len(s))))
        if a >= min_area and len(s) >= 3:
            cand.append((a, s))
    out = []
    for i, (a, s) in enumerate(cand):
        # внутренний контур (отверстие): лежит внутри другого контура этого слоя
        is_hole = any(j != i and b > a and point_in_poly(s.mean(axis=0), t) for j, (b, t) in enumerate(cand))
        out.append(lap_smooth(s, 3) if is_hole else lap_smooth(s, 1))
    return out


def to_m(p):
    return ((p[0] - CX) * SCALE, -(p[1] - CY) * SCALE)       # x вправо, z вверх


LOOPS = {"plate": layer_loops(solid), "red": layer_loops(label == 2), "green": layer_loops(label == 3)}


def loop_area(s):
    return 0.5 * abs(sum(s[i, 0] * s[(i + 1) % len(s), 1] - s[(i + 1) % len(s), 0] * s[i, 1] for i in range(len(s))))


# На виде сзади в референсе плита сплошная (глаза и рот не сквозные), хотя спереди в них виден ключевой зелёный фон:
# лист противоречит сам себе. Берём физически согласованный вариант: плита сплошная, отверстия только в масках.
PLATE_HOLES = False
if not PLATE_HOLES:
    LOOPS["plate"] = [max(LOOPS["plate"], key=loop_area)]
for k, v in LOOPS.items():
    print("layer", k, "loops", len(v), "points", [len(s) for s in v])


# ---------- сборка слоёв ----------
def build_layer(name, loops, y_front, depth, bevel, segs):
    # Контуры (с отверстиями) -> 2D-кривая с заполнением и выдавливанием -> сетка. Встроенное заполнение Blender
    # корректно обрабатывает вложенные контуры; свой triangle_fill на плотных контурах давал кривые треугольники.
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = depth / 2
    for s in loops:
        sp = cu.splines.new("POLY")
        sp.points.add(len(s) - 1)
        for i, p in enumerate(s):
            x_, z_ = to_m(p)
            sp.points[i].co = (x_, z_, 0.0, 1.0)
        sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob = vl.objects.active
    me0 = ob.data
    nvv = len(me0.vertices)
    cc = np.empty(nvv * 3, np.float32)
    me0.vertices.foreach_get("co", cc)
    cc = cc.reshape(nvv, 3)
    # кривая лежит в плоскости XY (z - выдавливание): переводим в модель X=x, Z=y, Y=y_front+(depth/2 - z); поворот без отражения
    new = np.empty_like(cc)
    new[:, 0] = cc[:, 0]
    new[:, 1] = y_front + (depth / 2 - cc[:, 2])
    new[:, 2] = cc[:, 1]
    me0.vertices.foreach_set("co", new.ravel())
    me0.update()
    bmn = bmesh.new()
    bmn.from_mesh(me0)
    bmesh.ops.remove_doubles(bmn, verts=bmn.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bmn, faces=bmn.faces)
    bmn.to_mesh(me0)
    bmn.free()
    ob.name = name

    def diag(tag):
        bmd = bmesh.new()
        bmd.from_mesh(ob.data)
        nm = sum(1 for e in bmd.edges if len(e.link_faces) > 2)
        bd = sum(1 for e in bmd.edges if len(e.link_faces) == 1)
        tiny = sum(1 for f in bmd.faces if f.calc_area() < 1e-9)
        print("DIAG", name, tag, "verts", len(bmd.verts), "faces", len(bmd.faces), "nonmanifold edges", nm, "boundary edges", bd, "tiny faces", tiny)
        bmd.free()
    diag("after fill")
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = ob
    ob.select_set(True)
    bv = ob.modifiers.new("bev", "BEVEL")
    bv.width = bevel
    bv.segments = segs
    bv.limit_method = "ANGLE"
    bv.angle_limit = math.radians(30)
    bv.use_clamp_overlap = True    # контуры плотные (рёбра ~1 мм): без ограничения фаска перекрывается и даёт щели
    bpy.ops.object.modifier_apply(modifier="bev")
    tr = ob.modifiers.new("tri", "TRIANGULATE")
    tr.min_vertices = 4
    bpy.ops.object.modifier_apply(modifier="tri")
    return ob


SINK = 0.004
plate = build_layer("plate", LOOPS["plate"], Y_PLATE_FRONT, PLATE_T, 0.008, 4)
redm = build_layer("red", LOOPS["red"], Y_RED, (Y_PLATE_FRONT - Y_RED) + SINK, 0.005, 3)
grnm = build_layer("green", LOOPS["green"], Y_GREEN, (Y_PLATE_FRONT - Y_GREEN) + SINK, 0.005, 3)
for ob, cls in ((plate, 0), (redm, 1), (grnm, 2)):
    a = ob.data.attributes.new("mask_class", "INT", "FACE")
    for i in range(len(ob.data.polygons)):
        a.data[i].value = cls
    print(ob.name, "tris", len(ob.data.polygons))
for o in vl.objects:
    o.select_set(False)
for ob in (redm, grnm, plate):
    ob.select_set(True)
vl.objects.active = plate
bpy.ops.object.join()
clean = plate
clean.name = "emblem_playwright_fromref"
clean.data.name = "emblem_playwright_fromref"
me = clean.data
pn = len(me.polygons)
print("clean tris", pn)


# ---------- цвета и тона из референса ----------
def tones(mask, name):
    cols = np.where(mask.any(0))[0]
    mid = (cols.min() + cols.max()) / 2
    xx = np.arange(W)[None, :]
    lm = mask & (xx < mid - 4)
    rm = mask & (xx > mid + 4)
    L = tuple(int(v * 255) for v in np.median(front[lm], axis=0))
    R = tuple(int(v * 255) for v in np.median(front[rm], axis=0))
    mid_m = (mid - CX) * SCALE
    print(name, "tones", L, R, "split x %.4f" % mid_m)
    return L, R, mid_m


red_l, red_r, red_split = tones(label == 2, "red")
grn_l, grn_r, grn_split = tones(label == 3, "green")
pm_ = (label == 1) & (b_ > r_)
lum = front.mean(axis=2)
lo_, hi_ = np.percentile(lum[pm_], [50, 92])
plate_c = tuple(int(v * 255) for v in np.median(front[pm_ & (lum >= lo_) & (lum <= hi_)], axis=0))
print("plate colour", plate_c)

arr = np.zeros((PAL, PAL, 3), np.uint8)
q = PAL // 4
arr[0:q] = plate_c
arr[q:2 * q, :PAL // 2] = red_l
arr[q:2 * q, PAL // 2:] = red_r
arr[2 * q:3 * q, :PAL // 2] = grn_l
arr[2 * q:3 * q, PAL // 2:] = grn_r
arr[3 * q:] = plate_c


def png_bytes(a):
    h, w, _ = a.shape
    raw = b"".join(b"\x00" + a[i].tobytes() for i in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


pal_path = f"{ROOT}/assets-src/palette_playwright_ref.png"
open(pal_path, "wb").write(png_bytes(arr))
img = bpy.data.images.load(pal_path)
img.reload()
img.pack()

# ---------- UV по классам ----------
n_v = len(me.vertices)
co = np.empty(n_v * 3, np.float32)
me.vertices.foreach_get("co", co)
co = co.reshape(n_v, 3)
vi = np.empty(len(me.loops), np.int32)
me.loops.foreach_get("vertex_index", vi)
lt = np.empty(pn, np.int32)
me.polygons.foreach_get("loop_total", lt)
pol_of_loop = np.repeat(np.arange(pn), lt)
vals = np.empty(pn, np.int32)
me.attributes.get("mask_class").data.foreach_get("value", vals)
cls_l = vals[pol_of_loop]
lx = co[vi, 0]
row_c = np.array([0.125, 0.375, 0.625], np.float32)
split = np.where(cls_l == 1, red_split, np.where(cls_l == 2, grn_split, 0.0))
u = np.clip(0.5 + (lx - split) / 1.0, 0.02, 0.98).astype(np.float32)
u = np.where(cls_l == 0, 0.25, u)
uv = np.zeros((len(me.loops), 2), np.float32)
uv[:, 0] = u
uv[:, 1] = 1 - row_c[cls_l]
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])
uvl = me.uv_layers.new(name="UVMap")
uvl.data.foreach_set("uv", uv.ravel())
me.attributes.remove(me.attributes.get("mask_class"))
mat = bpy.data.materials.new("emblem_playwright_ref_mat")
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

# затенение: сглаживание по углу, плоские грани плоские
for o in vl.objects:
    o.select_set(False)
vl.objects.active = clean
clean.select_set(True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
# плоские грани (лицо слоёв и тыл) - плоское затенение: иначе в больших узких треугольниках подмешиваются нормали скругления кромки
pn2 = len(me.polygons)
nor2 = np.empty(pn2 * 3, np.float32)
me.polygons.foreach_get("normal", nor2)
nor2 = nor2.reshape(pn2, 3)
smooth2 = np.array([p.use_smooth for p in me.polygons], bool)
smooth2[np.abs(nor2[:, 1]) > 0.999] = False
me.polygons.foreach_set("use_smooth", smooth2)
me.update()

# ---------- контроль: оригинал (высокополигональный) и эталон рядом ----------
before = set(bpy.data.objects.keys())
bpy.ops.import_scene.gltf(filepath=f"{ROOT}/assets-src/models/emblem_playwright.glb")
orig = [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before and bpy.data.objects[n].type == "MESH"][0]
orig.name = "emblem_playwright_high"
orig.location = (-1.0, 0, 0)
hw, hh = 0.6, 0.4
pm = bpy.data.meshes.new("ref_plane")
pm.from_pydata([(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)], [], [(0, 1, 2, 3)])
puv = pm.uv_layers.new(name="UVMap")
for i, (a_, b2) in enumerate([(0, 0.5), (0.5, 0.5), (0.5, 1), (0, 1)]):
    puv.data[i].uv = (a_, b2)
plane = bpy.data.objects.new("REFERENCE_figma", pm)
coll.objects.link(plane)
plane.location = (1.25, 0, 0)
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
    lt_ = bpy.data.lights.new(name, "AREA")
    lt_.energy = e
    lt_.size = 2.0
    lo = bpy.data.objects.new(name, lt_)
    lo.location = loc
    coll.objects.link(lo)
wd = bpy.data.worlds.new("w")
wd.use_nodes = True
wd.node_tree.nodes["Background"].inputs[0].default_value = (0.12, 0.12, 0.13, 1)
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
            r3.view_location = Vector((0.1, 0.0, 0.0))
            r3.view_distance = 4.0
print("RESULT tris", pn)
bpy.ops.wm.save_as_mainfile(filepath=f"{ROOT}/assets-src/emblem_playwright_fromref.blend")
print("SAVED")

if OUT_GLB:
    keep = clean
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
