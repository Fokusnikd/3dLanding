# Запуск: blender -b -P scripts/paint_layers.py -- <orig.glb> <prefix> <out.glb> [ratio]
# Эмблема из слоёв (Playwright). Грани делятся на подложку и маски по глубине, маски на красную и зелёную — по цвету
# референса в точке проекции (границу даёт референс). Каждому слою — своя копия референса, где цвет слоя продолжен
# за границы (scripts/prep_layers.py), поэтому небольшой промах проекции не подтягивает цвет соседнего слоя.
import sys, json, math, bpy, bmesh
import numpy as np
from mathutils.kdtree import KDTree

src, prefix, dst = sys.argv[sys.argv.index("--") + 1:][:3]
rest = sys.argv[sys.argv.index("--") + 4:]
ratio = float(rest[0]) if rest else 0.15

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
mod = obj.modifiers.new("dec", "DECIMATE")
mod.ratio = ratio
bpy.ops.object.modifier_apply(modifier="dec")
while obj.data.color_attributes:
    obj.data.color_attributes.remove(obj.data.color_attributes[0])

meta = json.load(open(prefix + "_layers.json"))
AW, AH = meta["size"]
tiles = meta["tiles"]  # плитки: подложка, красная, зелёная, вид сзади — [x, y, w, h] силуэта в атласе
img = bpy.data.images.load(prefix + "_layers.png")

# класс референса в точке — берём из плиток: красная плитка там красная, где слой «красный» в оригинале.
# Для голосования по цвету читаем исходный вид (плитка подложки хранит оригинальные цвета вне масок, поэтому берём из зелёной/красной)
W_, H_ = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H_, W_, 4)[::-1, :, :3]
px = (np.clip(px, 0, 1) ** (1 / 2.2)) * 255

def tile_view(i):
    x, y, w, h = tiles[i]
    return px[y:y + h, x:x + w]

tr, tg = tile_view(1), tile_view(2)
def hue_class(c):
    r, g, b = c
    if r > g + 40 and r > b + 40:
        return 1
    if g > r + 25 and g > b + 25:
        return 2
    return 0
# оригинальная классификация лежит в самих плитках только внутри слоя; восстанавливаем маску слоя по «не растянутому» цвету:
# пиксель принадлежит красному слою, если в красной плитке он красный, и т. п.
def layer_at(tx, tz):
    x, y, w, h = tiles[1]
    ix, iz = min(w - 1, max(0, int(tx * w))), min(h - 1, max(0, int(tz * h)))
    cr = hue_class(tr[iz, ix])
    cg = hue_class(tg[iz, ix])
    return cr, cg

me = obj.data
xs = [v.co.x for v in me.vertices]
zs = [v.co.z for v in me.vertices]
minx, maxx, minz, maxz = min(xs), max(xs), min(zs), max(zs)
bm = bmesh.new()
bm.from_mesh(me)
bm.normal_update()
bm.faces.ensure_lookup_table()

def proj(co):
    return (co.x - minx) / (maxx - minx), (maxz - co.z) / (maxz - minz)

# граница глубины между подложкой и масками: 2-средние по глубине лицевых граней, взвешенные площадью
top = [f for f in bm.faces if f.normal.y < -0.3]
ys = np.array([f.calc_center_median().y for f in top])
wts = np.array([f.calc_area() for f in top])
c0, c1 = ys.min(), ys.max()
for _ in range(30):
    a = np.abs(ys - c0) < np.abs(ys - c1)
    if a.all() or (~a).all():
        break
    c0, c1 = np.average(ys[a], weights=wts[a]), np.average(ys[~a], weights=wts[~a])
thr = (c0 + c1) / 2
print("layers y", c0, c1, "thr", thr)

# метка слоя лицевых граней: 0 подложка, 1 красная, 2 зелёная
lab = {}
for f in top:
    if f.calc_center_median().y > thr:
        lab[f.index] = 0
        continue
    tx, tz = proj(f.calc_center_median())
    # цвет референса в этой точке: в плитке подложки вне масок оригинальный цвет подложки, в масках — оригинальный цвет маски
    x, y, w, h = tiles[0]
    ix, iz = min(w - 1, max(0, int(tx * w))), min(h - 1, max(0, int(tz * h)))
    c = hue_class(px[y + iz, x + ix])
    if c == 0:
        # в плитке подложки маски заменены на цвет подложки; смотрим плитки масок: где какой цвет «родной»
        cr, cg = layer_at(tx, tz)
        c = 1 if (cr == 1 and cg != 2) else 2 if (cg == 2 and cr != 1) else 0
    lab[f.index] = c
# грани маски, попавшие в подложку из-за неточности проекции: берём метку ближайшей грани маски
kd = KDTree(sum(1 for v in lab.values() if v) or 1)
mask_faces = [i for i, v in lab.items() if v]
kd = KDTree(len(mask_faces))
for n, i in enumerate(mask_faces):
    c = bm.faces[i].calc_center_median()
    kd.insert((c.x, 0, c.z), n)
kd.balance()
for f in top:
    if f.calc_center_median().y <= thr and lab[f.index] == 0 and mask_faces:
        c = f.calc_center_median()
        _, n, _ = kd.find((c.x, 0, c.z))
        lab[f.index] = lab[mask_faces[n]]

# боковые грани: слой по самой выступающей вершине, класс маски — по ближайшей лицевой грани маски
for f in bm.faces:
    if f.index in lab or f.normal.y > 0.3:
        continue
    ymin = min(v.co.y for v in f.verts)
    if ymin > thr:
        lab[f.index] = 0
    else:
        c = f.calc_center_median()
        _, n, _ = kd.find((c.x, 0, c.z))
        lab[f.index] = lab[mask_faces[n]]

uv = bm.loops.layers.uv.verify()
for f in bm.faces:
    back = f.normal.y > 0.3
    ti = 3 if back else lab.get(f.index, 0)
    x, y, w, h = tiles[ti]
    for lp in f.loops:
        tx, tz = proj(lp.vert.co)
        if back:
            tx = 1 - tx
        lp[uv].uv = ((x + tx * w) / AW, 1 - (y + tz * h) / AH)
bm.to_mesh(me)
bm.free()

img.pack()
mat = bpy.data.materials.new("emblem")
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tn = nt.nodes.new("ShaderNodeTexImage")
tn.image = img
tn.extension = "EXTEND"
nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.8
bsdf.inputs["Metallic"].default_value = 0.0
me.materials.clear()
me.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="AUTO")
print("done", dst)
