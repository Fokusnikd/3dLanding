# Запуск: blender -b -P scripts/paint_js_flat.py -- <orig.glb> <palette_prefix> <out.glb> [ratio]
# Покраска щита JavaScript по геометрии, без проекции картинки: щит (две половины), буква J, буква S, торцы и тыл.
# Границы цвета идут по рёбрам модели, поэтому края букв чистые.
import sys, bpy, bmesh
import numpy as np

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

me = obj.data
bm = bmesh.new()
bm.from_mesh(me)
bm.normal_update()
bm.faces.ensure_lookup_table()
xs = [v.co.x for v in bm.verts]
minx, maxx = min(xs), max(xs)
cx = (minx + maxx) / 2

# глубина лицевой плоскости щита и верха букв: два кластера по Y (вперёд — это -Y)
top = [f for f in bm.faces if f.normal.y < -0.3]
ys = np.array([f.calc_center_median().y for f in top])
wt = np.array([f.calc_area() for f in top])
c0, c1 = ys.min(), ys.max()
for _ in range(40):
    a = np.abs(ys - c0) < np.abs(ys - c1)
    if a.all() or (~a).all():
        break
    c0, c1 = np.average(ys[a], weights=wt[a]), np.average(ys[~a], weights=wt[~a])
thr = (c0 + c1) / 2
print("letters y", c0, "shield y", c1, "thr", thr)

ROW = {"shield": 0.125, "J": 0.375, "S": 0.625, "back": 0.875}
uv = bm.loops.layers.uv.verify()
count = {"shield": 0, "J": 0, "S": 0, "back": 0}
for f in bm.faces:
    c = f.calc_center_median()
    if f.normal.y > 0.3:
        part = "back"
    elif f.normal.y < -0.3:
        part = "shield" if c.y > thr else ("J" if c.x < cx else "S")
    else:
        ymin = min(v.co.y for v in f.verts)
        part = "shield" if ymin > thr else ("J" if c.x < cx else "S")
    count[part] += 1
    for lp in f.loops:
        if part == "shield":
            u = (lp.vert.co.x - minx) / (maxx - minx)
            u = 0.0005 + u * 0.999
        else:
            u = 0.25
        lp[uv].uv = (u, 1 - ROW[part])
print("faces", count)
bm.to_mesh(me)
bm.free()

img = bpy.data.images.load(prefix + "_palette.png")
img.pack()
mat = bpy.data.materials.new("emblem")
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
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="AUTO")
print("done")
