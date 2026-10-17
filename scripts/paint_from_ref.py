# Запуск: blender -b -P scripts/paint_from_ref.py -- <orig.glb> <atlas_prefix> <out.glb> [ratio]
# Упрощает эмблему (как раньше) и красит её по референсу: вид спереди проецируется на грани, смотрящие вперёд,
# вид сзади — на грани, смотрящие назад. Боковые грани берут цвет с края проекции спереди.
import sys, json, bpy
from mathutils import Vector

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
print("tris", len(obj.data.polygons))

meta = json.load(open(prefix + "_atlas.json"))
AW, AH = meta["size"]
fx, fy, fw, fh = meta["front"]
bx, by, bw, bh = meta["back"]

me = obj.data
xs = [v.co.x for v in me.vertices]
zs = [v.co.z for v in me.vertices]
minx, maxx, minz, maxz = min(xs), max(xs), min(zs), max(zs)

# Blender: перед модели смотрит в -Y (в glTF — +Z)
uv = me.uv_layers.new(name="UV")
for poly in me.polygons:
    back = poly.normal.y > 0.3
    for li in poly.loop_indices:
        co = me.vertices[me.loops[li].vertex_index].co
        tx = (co.x - minx) / (maxx - minx)
        tz = (maxz - co.z) / (maxz - minz)  # 0 сверху
        if back:
            px, py = bx + (1 - tx) * bw, by + tz * bh
        else:
            px, py = fx + tx * fw, fy + tz * fh
        uv.data[li].uv = (px / AW, 1 - py / AH)

img = bpy.data.images.load(prefix + "_atlas.png")
img.pack()
mat = bpy.data.materials.new("emblem")
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tn = nt.nodes.new("ShaderNodeTexImage")
tn.image = img
tn.interpolation = "Linear"
tn.extension = "EXTEND"
nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.8
bsdf.inputs["Metallic"].default_value = 0.0
me.materials.clear()
me.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="AUTO")
print("done", dst)
