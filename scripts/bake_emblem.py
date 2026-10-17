# Запуск: blender -b -P scripts/bake_emblem.py -- <in.glb> <out.glb> [ratio] [tex_size]
# Упрощает эмблему и запекает цвет вершин оригинала в текстуру низкополигональной копии.
import sys, os, json, bpy

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
ratio = float(argv[2]) if len(argv) > 2 else 0.15
size = int(argv[3]) if len(argv) > 3 else 2048

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
assert len(meshes) == 1, meshes
high = meshes[0]
high.name = "high"
dim = max(high.dimensions)

# низкополигональная копия
low = high.copy()
low.data = high.data.copy()
low.name = "low"
bpy.context.collection.objects.link(low)
mod = low.modifiers.new("dec", "DECIMATE")
mod.ratio = ratio
bpy.context.view_layer.objects.active = low
for o in bpy.context.scene.objects:
    o.select_set(False)
low.select_set(True)
bpy.ops.object.modifier_apply(modifier="dec")
print("tris low:", len(low.data.polygons))

# убираем мелкую рябь генерации на гранях: несколько проходов сглаживания вершин
smooth = int(os.environ.get("SMOOTH", "0"))
if smooth:
    sm = low.modifiers.new("smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = smooth
    bpy.ops.object.modifier_apply(modifier="smooth")
bpy.ops.object.shade_smooth()

# развёртка
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004)
bpy.ops.object.mode_set(mode="OBJECT")

# материал оригинала: цвет вершин -> Base Color
attr_name = high.data.color_attributes[0].name
hm = high.data.materials[0]
nt = hm.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
for l in list(bsdf.inputs["Base Color"].links):
    nt.links.remove(l)
ca = nt.nodes.new("ShaderNodeVertexColor")
ca.layer_name = attr_name
nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])

# материал низкополигональной копии с целевой текстурой
lm = bpy.data.materials.new("emblem_baked")
lm.use_nodes = True
lt = lm.node_tree
lb = next(n for n in lt.nodes if n.type == "BSDF_PRINCIPLED")
img = bpy.data.images.new("emblem_color", size, size, alpha=True)
img.generated_color = (0, 0, 0, 0)
tn = lt.nodes.new("ShaderNodeTexImage")
tn.image = img
lt.links.new(tn.outputs["Color"], lb.inputs["Base Color"])
lb.inputs["Roughness"].default_value = 0.8
lb.inputs["Metallic"].default_value = 0.0
for n in lt.nodes:
    n.select = False
tn.select = True
lt.nodes.active = tn
low.data.materials.clear()
low.data.materials.append(lm)
low.data.color_attributes.remove(low.data.color_attributes[0]) if low.data.color_attributes else None

# запекание
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 1
for o in sc.objects:
    o.select_set(False)
high.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.bake(
    type="DIFFUSE",
    pass_filter={"COLOR"},
    use_selected_to_active=True,
    cage_extrusion=dim * 0.01,
    max_ray_distance=dim * 0.03,
    margin=12,
    margin_type="EXTEND",
)


# очистка: цвет оригинала содержит запечённый свет и тени с исходных картинок. Сводим текстуру к плоской палитре
# (k-means по цвету), освещение даёт сцена. K = число основных цветов эмблемы (0 — не трогать).
import numpy as np
K = int(argv[4]) if len(argv) > 4 else 0
raw = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
if len(argv) > 5:
    np.save(argv[5], raw)
if K:
    covered = raw[..., 3] > 0.5
    px = raw[covered][:, :3]
    # работаем в гамма-пространстве sRGB, ближе к восприятию
    lin = np.clip(px, 0, 1) ** (1 / 2.2)
    rng = np.random.default_rng(1)
    sample = lin[rng.choice(len(lin), min(200000, len(lin)), replace=False)]
    # инициализация: самые далёкие друг от друга цвета (k-means++)
    centers = [sample[rng.integers(len(sample))]]
    for _ in range(K - 1):
        d = np.min([((sample - c) ** 2).sum(1) for c in centers], axis=0)
        centers.append(sample[np.argmax(d)])
    centers = np.array(centers)
    for _ in range(25):
        lab = np.argmin(((sample[:, None] - centers[None]) ** 2).sum(2), axis=1)
        for k in range(K):
            m = sample[lab == k]
            if len(m):
                centers[k] = np.median(m, axis=0)
    lab_all = np.argmin(((lin[:, None] - centers[None]) ** 2).sum(2), axis=1) if len(lin) < 300000 else np.concatenate(
        [np.argmin(((lin[i:i + 200000, None] - centers[None]) ** 2).sum(2), axis=1) for i in range(0, len(lin), 200000)])
    print("PALETTE", [tuple(int(v * 255) for v in c) for c in centers], "shares", np.bincount(lab_all, minlength=K) / len(lab_all))
    # PALETTE_MAP: [[[r, g, b] найденного цвета, [r, g, b] чистого альбедо], ...] — заменяем ближайший к первому цвету кластер
    for src_rgb, dst_rgb in json.loads(os.environ.get("PALETTE_MAP", "[]")):
        k = int(np.argmin(((centers - np.array(src_rgb, dtype=np.float32) / 255) ** 2).sum(1)))
        centers[k] = np.array(dst_rgb, dtype=np.float32) / 255
    # убираем одиночные «крапинки»: каждому пикселю достаётся самый частый цвет в окне 5x5 (два прохода)
    lab2 = np.full((size, size), -1, dtype=np.int16)
    lab2[covered] = lab_all
    for _ in range(int(os.environ.get("DESPECKLE", "2"))):
        padl = np.pad(lab2, 2, mode="edge")
        counts = np.zeros((K, size, size), dtype=np.int16)
        for dy in range(5):
            for dx in range(5):
                win = padl[dy:dy + size, dx:dx + size]
                for k in range(K):
                    counts[k] += win == k
        lab2 = np.where(covered, counts.argmax(0), -1).astype(np.int16)
    lab_all = lab2[covered]
    out = raw.copy()
    out[covered, :3] = (centers[lab_all]) ** 2.2
    out[covered, 3] = 1.0
    # лёгкое сглаживание границ цветов (антиалиасинг)
    pad = np.pad(out[..., :3], ((1, 1), (1, 1), (0, 0)), mode="edge")
    soft = sum(pad[dy:dy + size, dx:dx + size] for dy in range(3) for dx in range(3)) / 9
    out[..., :3] = np.where(covered[..., None], soft, out[..., :3])
    out[..., 3] = 1.0
    img.pixels = out.ravel().tolist()

# сохранение: удаляем оригинал, экспортируем низкополигональную модель
bpy.data.objects.remove(high, do_unlink=True)
img.pack()
bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    use_selection=False,
    export_image_format="WEBP",
    export_image_quality=92,
)
print("done", dst)
