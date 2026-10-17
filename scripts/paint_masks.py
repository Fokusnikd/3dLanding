# Запуск: blender -b -P scripts/paint_masks.py -- <orig.glb> <atlas_prefix> <out.glb> [ratio]
# Для эмблемы из нескольких слоёв (Playwright: подложка, красная и зелёная маски). Сгенерированная модель не совпадает
# с референсом попиксельно, поэтому сетка делится по резким рёбрам на части, каждой части назначается слой по цвету
# референса, а зелёная и красная маски совмещаются с референсом по своим границам отдельно от подложки.
import sys, json, math, bpy, bmesh
import numpy as np
from collections import deque

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

meta = json.load(open(prefix + "_atlas.json"))
AW, AH = meta["size"]
fx, fy, fw, fh = meta["front"]
bx, by, bw, bh = meta["back"]
img = bpy.data.images.load(prefix + "_atlas.png")
px = np.array(img.pixels[:], dtype=np.float32).reshape(AH, AW, 4)[::-1, :, :3] * 255  # строка 0 сверху
px = np.clip(px, 0, 255) ** 1  # цвета в линейном виде пишет Blender для sRGB-файла: приводим обратно ниже
px = (np.clip(px / 255, 0, 1) ** (1 / 2.2)) * 255

def cls_of(c):
    r, g, b = c
    if r > g + 40 and r > b + 40:
        return 1  # красная
    if g > r + 25 and g > b + 25:
        return 2  # зелёная
    return 0  # подложка

front = px[fy:fy + fh, fx:fx + fw]
r_, g_, b_ = front[..., 0], front[..., 1], front[..., 2]
fcls = np.zeros(front.shape[:2], np.int8)
fcls[(r_ > g_ + 40) & (r_ > b_ + 40)] = 1
fcls[(g_ > r_ + 25) & (g_ > b_ + 25)] = 2

def bbox(mask, erode=9):
    # съедаем тонкую кайму у силуэта (остатки зелёного фона), затем берём рамку основной области
    for _ in range(erode):
        p = np.pad(mask, 1, constant_values=False)
        mask = mask & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    ys, xs = np.where(mask)
    return (xs.min() - erode) / fw, (xs.max() + erode) / fw, (ys.min() - erode) / fh, (ys.max() + erode) / fh  # доли силуэта, y сверху

ref_bb = {k: bbox(fcls == k) for k in (1, 2)}

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

def sample_cls(tx, tz):
    x = min(fw - 1, max(0, int(tx * fw)))
    y = min(fh - 1, max(0, int(tz * fh)))
    return int(fcls[y, x])

# части: грани, связанные плавными рёбрами (резкий угол — граница)
SMOOTH = math.radians(38)
comp = [-1] * len(bm.faces)
comps = []
for f in bm.faces:
    if comp[f.index] >= 0:
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
                if comp[b.index] < 0 and a.normal.angle(b.normal, 0) < SMOOTH:
                    comp[b.index] = cid
                    q.append(b)
    comps.append(members)
print("components", len(comps))

# слой каждой части: по цвету референса в её лицевых гранях; боковые части — по ближайшей лицевой
kind = []  # "top" / "back" / "wall"
label = []
for members in comps:
    area = sum(f.calc_area() for f in members)
    n = sum((f.normal * f.calc_area() for f in members), type(members[0].normal)((0, 0, 0)))
    ny = n.y / max(area, 1e-9)
    if ny < -0.5:
        kind.append("top")
    elif ny > 0.5:
        kind.append("back")
    else:
        kind.append("wall")
    votes = [0.0, 0.0, 0.0]
    for f in members:
        tx, tz = proj(f.calc_center_median())
        votes[sample_cls(tx, tz)] += f.calc_area()
    label.append(int(np.argmax(votes)))

# боковые части и мелкие обломки: слой берём у лицевой части, к которой они ближе всего прилегают и которая выступает вперёд
vert_comps = {}
for ci, members in enumerate(comps):
    for f in members:
        for v in f.verts:
            vert_comps.setdefault(v.index, set()).add(ci)
mean_y = [np.mean([f.calc_center_median().y for f in m]) for m in comps]
for ci, members in enumerate(comps):
    if kind[ci] == "wall" or (kind[ci] == "top" and sum(f.calc_area() for f in members) < 1e-5):
        neigh = {}
        for f in members:
            for v in f.verts:
                for cj in vert_comps[v.index]:
                    if cj != ci and kind[cj] == "top":
                        neigh[cj] = neigh.get(cj, 0) + 1
        if neigh:
            best = min(neigh, key=lambda cj: (mean_y[cj] - min(f.calc_center_median().y for f in members)) ** 2)
            label[ci] = label[best]

import collections
print("kinds", collections.Counter(kind), "labels", collections.Counter(zip(kind, label)))
# совмещение: ограничивающие рамки частей зелёной и красной маски в модели
mesh_bb = {}
for k in (1, 2):
    fs = [f for ci, m in enumerate(comps) if kind[ci] == "top" and label[ci] == k for f in m]
    if not fs:
        continue
    pts = [proj(v.co) for f in fs for v in f.verts]
    mesh_bb[k] = (min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts))
print("mesh bbox", mesh_bb)
print("ref bbox", ref_bb)

# точка внутри слоя с типичным цветом (для боковых граней)
def typical(k):
    m = fcls == k
    ys, xs_ = np.where(m)
    cols = front[m]
    med = np.median(cols, axis=0)
    i = np.argmin(((cols - med) ** 2).sum(1))
    return xs_[i], ys[i]

TYP = {k: typical(k) for k in (0, 1, 2)}
uv_layer = bm.loops.layers.uv.verify()
for ci, members in enumerate(comps):
    k = label[ci]
    for f in members:
        for lp in f.loops:
            co = lp.vert.co
            if kind[ci] == "back":
                tx, tz = proj(co)
                lp[uv_layer].uv = ((bx + (1 - tx) * bw) / AW, 1 - (by + tz * bh) / AH)
            elif kind[ci] == "wall":
                x, y = TYP[k]
                lp[uv_layer].uv = ((fx + x) / AW, 1 - (fy + y) / AH)
            else:
                tx, tz = proj(co)
                if k in mesh_bb and k in ref_bb and k == 2:
                    m0, m1, n0, n1 = mesh_bb[k]
                    r0, r1, s0, s1 = ref_bb[k]
                    tx = r0 + (tx - m0) / (m1 - m0) * (r1 - r0)
                    tz = s0 + (tz - n0) / (n1 - n0) * (s1 - s0)
                lp[uv_layer].uv = ((fx + tx * fw) / AW, 1 - (fy + tz * fh) / AH)
bm.to_mesh(me)
bm.free()

mat = bpy.data.materials.new("emblem")
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tn = nt.nodes.new("ShaderNodeTexImage")
tn.image = img
tn.extension = "EXTEND"
img.pack()
nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.8
bsdf.inputs["Metallic"].default_value = 0.0
me.materials.clear()
me.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="AUTO")
print("done", dst)
