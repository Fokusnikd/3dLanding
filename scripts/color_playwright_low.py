# Запуск: blender -b -P scripts/color_playwright_low.py -- [out.glb]
# Playwright: упрощённая (15%) нейросетевая модель остаётся БЕЗ ИЗМЕНЕНИЙ геометрии (38 902 треугольника), красится только цвет:
# каждая грань получает класс (плита / красная маска / зелёная маска), цвета и тоны берутся из референса Figma,
# покраска идёт через палитру 512x512 по UV (строка палитры = класс, граница тона = центр маски).
# Красная и зелёная маски лежат на одной глубине и образуют одну поверхность; шов между ними - неглубокая ложбина (около -0.037):
# берём только «глубокие» грани масок (y < CORE_Y), они распадаются на две области, остальные получают метку от ближайшей стороны.
# Результат: assets-src/emblem_playwright_lowcolored.blend и, если задан out.glb, экспорт цветной модели.
import bpy, bmesh, numpy as np, math, sys, struct, zlib
from collections import deque
from mathutils import Vector, Euler

ROOT = "D:/cursorTestProjects/mypage"
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_GLB = args[0] if args else None
PAL = 512
TOP_Y = -0.0300       # грани глубже этого y - верх масок (плита лежит около -0.016)
CORE_Y = -0.0388      # «ядро» маски; мельче - ложбина между масками и кромка
SPLIT_DEG = 60

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.name = "Playwright_lowcolored"
coll = sc.collection
vl = bpy.context.view_layer
bpy.ops.import_scene.gltf(filepath=f"{ROOT}/assets-src/models/emblem_playwright.glb")
low = [o for o in sc.objects if o.type == "MESH"][0]
low.name = "emblem_playwright_low"
low.data.name = "emblem_playwright_low"
for o in sc.objects:
    o.select_set(o == low)
vl.objects.active = low
md = low.modifiers.new("dec", "DECIMATE")
md.ratio = 0.15
bpy.ops.object.modifier_apply(modifier="dec")
while low.data.color_attributes:
    low.data.color_attributes.remove(low.data.color_attributes[0])
print("low tris", len(low.data.polygons))

# копия для окраски: геометрия идентична
col = low.copy()
col.data = low.data.copy()
col.name = "emblem_playwright_low_colored"
col.data.name = "emblem_playwright_low_colored"
coll.objects.link(col)
col.location = (0.9, 0, 0)

# ---------- классы граней ----------
bm = bmesh.new()
bm.from_mesh(col.data)
bm.normal_update()
bm.faces.ensure_lookup_table()
cls = {}     # 0 плита, 1 красная, 2 зелёная

tops = [f for f in bm.faces if f.calc_center_median().y < TOP_Y and f.normal.y < -0.3]
top_ids = {f.index for f in tops}
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
print("mask components", len(comps), "areas", [round(areas[i], 4) for i in order[:4]], "centroid x red %.3f green %.3f" % (cx[red_id], cx[green_id]))
for i, m in enumerate(comps):
    if i == red_id:
        k = 1
    elif i == green_id:
        k = 2
    else:
        mx = np.mean([f.calc_center_median().x for f in m])
        k = 1 if abs(mx - cx[red_id]) < abs(mx - cx[green_id]) else 2
    for f in m:
        cls[f.index] = k
# остальные верхние грани (ложбина между масками, кромка): метка волной от ближайших размеченных
frontier = deque(core)
while frontier:
    a = frontier.popleft()
    for e in a.edges:
        for b in e.link_faces:
            if b.index in top_ids and b.index not in cls:
                cls[b.index] = cls[a.index]
                frontier.append(b)
# крутые грани (стенки), связанные с маской: ту же метку получают по цепочке до плиты (низ стенки лежит на уровне плиты)
steep_ids = {f.index for f in bm.faces if abs(f.normal.y) < 0.6}
frontier = deque(f for f in bm.faces if f.index in cls)
while frontier:
    a = frontier.popleft()
    for e in a.edges:
        for b in e.link_faces:
            if b.index in steep_ids and b.index not in cls:
                if b.calc_center_median().y < -0.0100:      # не заходим на боковые стенки самой плиты
                    cls[b.index] = cls[a.index]
                    frontier.append(b)
n_cls = {k: sum(1 for v in cls.values() if v == k) for k in (1, 2)}
print("faces by class: plate", len(bm.faces) - len(cls), "red", n_cls[1], "green", n_cls[2])
xs_by = {k: [v.co.x for f in bm.faces if cls.get(f.index) == k for v in f.verts] for k in (1, 2)}
split_x = {k: (min(xs_by[k]) + max(xs_by[k])) / 2 for k in (1, 2)}
print("split x", {k: round(v, 4) for k, v in split_x.items()})
face_cls = np.array([cls.get(i, 0) for i in range(len(bm.faces))], np.int32)
bm.free()

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
# тона масок берём с пикселей без каймы вблизи фона
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
    return tuple(int(v * 255) for v in np.median(front[lm], axis=0)), tuple(int(v * 255) for v in np.median(front[rm], axis=0))


red_l, red_r = tones(red & ~nb)
grn_l, grn_r = tones(green & ~nb)
pm_ = plate & ~nb & (b_ > r_)
lum = front.mean(axis=2)
lo_, hi_ = np.percentile(lum[pm_], [50, 92])
plate_c = tuple(int(v * 255) for v in np.median(front[pm_ & (lum >= lo_) & (lum <= hi_)], axis=0))
print("tones: red", red_l, red_r, "green", grn_l, grn_r, "plate", plate_c)
arr = np.zeros((PAL, PAL, 3), np.uint8)
q4 = PAL // 4
arr[0:q4] = plate_c
arr[q4:2 * q4, :PAL // 2] = red_l
arr[q4:2 * q4, PAL // 2:] = red_r
arr[2 * q4:3 * q4, :PAL // 2] = grn_l
arr[2 * q4:3 * q4, PAL // 2:] = grn_r
arr[3 * q4:] = plate_c


def png_bytes(a):
    h, w, _ = a.shape
    raw = b"".join(b"\x00" + a[i].tobytes() for i in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


pal_path = f"{ROOT}/assets-src/palette_playwright_low.png"
open(pal_path, "wb").write(png_bytes(arr))
img = bpy.data.images.load(pal_path)
img.reload()
img.pack()

# ---------- UV по классам ----------
me = col.data
pn = len(me.polygons)
nv = len(me.vertices)
co = np.empty(nv * 3, np.float32)
me.vertices.foreach_get("co", co)
co = co.reshape(nv, 3)
vi = np.empty(len(me.loops), np.int32)
me.loops.foreach_get("vertex_index", vi)
lt = np.empty(pn, np.int32)
me.polygons.foreach_get("loop_total", lt)
pol_of_loop = np.repeat(np.arange(pn), lt)
cls_l = face_cls[pol_of_loop]
lx = co[vi, 0]
row_c = np.array([0.125, 0.375, 0.625], np.float32)
split = np.where(cls_l == 1, split_x[1], np.where(cls_l == 2, split_x[2], 0.0))
u = np.clip(0.5 + (lx - split) / 1.0, 0.02, 0.98).astype(np.float32)
u = np.where(cls_l == 0, 0.25, u)
uv = np.zeros((len(me.loops), 2), np.float32)
uv[:, 0] = u
uv[:, 1] = 1 - row_c[cls_l]
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])
uvl = me.uv_layers.new(name="UVMap")
uvl.data.foreach_set("uv", uv.ravel())
mat = bpy.data.materials.new("emblem_playwright_low_mat")
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

# ---------- эталон рядом и вид ----------
hw, hh = 0.6, 0.4
pm = bpy.data.meshes.new("ref_plane")
pm.from_pydata([(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)], [], [(0, 1, 2, 3)])
puv = pm.uv_layers.new(name="UVMap")
for i, (a_, b2) in enumerate([(0, 0.5), (0.5, 0.5), (0.5, 1), (0, 1)]):
    puv.data[i].uv = (a_, b2)
plane = bpy.data.objects.new("REFERENCE_figma", pm)
coll.objects.link(plane)
plane.location = (2.15, 0, 0)
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
            r3.view_location = Vector((1.0, 0.0, 0.0))
            r3.view_distance = 4.4
print("RESULT tris", pn)
bpy.ops.wm.save_as_mainfile(filepath=f"{ROOT}/assets-src/emblem_playwright_lowcolored.blend")
print("SAVED")

if OUT_GLB:
    keep = col
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
