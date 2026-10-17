# Запуск: blender -b -P scripts/preview_glb.py -- <in.glb> <out_prefix>  — три ракурса модели при нейтральном свете
import sys, math, bpy
from mathutils import Vector
src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = 24; sc.cycles.device = "CPU"
sc.render.resolution_x = sc.render.resolution_y = 600
w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.35, 0.33, 0.3, 1); sc.world = w
objs = [o for o in sc.objects if o.type == "MESH"]
dim = max(max(o.dimensions) for o in objs)
for name, loc, e in [("key", (3, -4, 5), 300), ("fill", (-4, -3, 1), 120)]:
    l = bpy.data.lights.new(name, "AREA"); l.energy = e * dim * dim; l.size = dim * 2
    lo = bpy.data.objects.new(name, l); lo.location = Vector(loc) * dim; sc.collection.objects.link(lo)
    lo.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
for i, az in enumerate([0, 35, 70]):
    a = math.radians(az); d = dim * 3.2
    cam.location = (math.sin(a) * d * -1 * -1 * 0 + math.sin(a) * d, -math.cos(a) * d, dim * 0.25)
    cam.rotation_euler = (-Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{out}_{i}.png"
    bpy.ops.render.render(write_still=True)
