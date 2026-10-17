# Запуск: blender -b assets-src/emblem_js_review.blend -P scripts/simplify_emblem_js.py -- <out.glb>
# Упрощение низкополигональной эмблемы JS без порчи плоскостей. Исходник — объект emblem_js_low в .blend.
#  1) сварка вершин; буквы (грани глубже LETTER_FACE_Y) отделяются и не меняются;
#  2) тыл и лицевая плоскость щита: по вершинам подбирается плоскость (МНК) и вершины прижимаются к ней точно;
#  3) копланарные грани склеиваются (Planar, 1°) и триангулируются;
#  4) плоскости получают плоское затенение, скругления и торцы — сглаживание по углу (иначе на свету «лучи»).
import bpy, bmesh, numpy as np, math, sys

LETTER_FACE_Y = -0.058
TOL_SNAP = 0.0030      # вершины ближе 3 мм к плоскости притягиваются к ней (у лицевой стороны лёгкая выпуклость до 2.7 мм)
TOL_FACE = 0.003       # грань считается лежащей в плоскости, если её центр ближе 3 мм
minx, maxx, miny, maxy = -0.32743823528289795, 0.3274596929550171, -0.08882222324609756, 0.08882073312997818
out_path = sys.argv[sys.argv.index("--") + 1]

src = bpy.data.objects["emblem_js_low"]
sc = bpy.data.scenes["EmblemJS_review"]
coll = bpy.data.collections["emblem_js_work"]
vl = sc.view_layers[0]
bpy.context.window.scene = sc if bpy.context.window else None
for name in ("emblem_js_flat",):
    o = bpy.data.objects.get(name)
    if o:
        d = o.data; bpy.data.objects.remove(o, do_unlink=True)
        if d.users == 0: bpy.data.meshes.remove(d)

def fit_plane(pts):
    A = np.c_[pts[:, 0], pts[:, 2], np.ones(len(pts))]
    c, *_ = np.linalg.lstsq(A, pts[:, 1], rcond=None)
    r = pts[:, 1] - A @ c
    keep = np.abs(r) < 0.003
    c, *_ = np.linalg.lstsq(A[keep], pts[keep, 1], rcond=None)
    return c   # y = a*x + b*z + c

bm = bmesh.new(); bm.from_mesh(src.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bm.normal_update(); bm.faces.ensure_lookup_table()
letters = {f.index for f in bm.faces if f.calc_center_median().y < LETTER_FACE_Y}
bmL = bm.copy(); bmB = bm.copy(); bm.free()
bmL.faces.ensure_lookup_table(); bmB.faces.ensure_lookup_table()
bmesh.ops.delete(bmL, geom=[f for f in bmL.faces if f.index not in letters], context="FACES")
bmesh.ops.delete(bmB, geom=[f for f in bmB.faces if f.index in letters], context="FACES")

# --- выравнивание плоскостей тела ---
bmB.normal_update()
def snap(sel, label):
    faces = [f for f in bmB.faces if sel(f)]
    pts = np.array([tuple(f.calc_center_median()) for f in faces])
    inner = (np.abs(pts[:, 0]) < 0.30) & (pts[:, 2] > -0.34) & (pts[:, 2] < 0.36)
    c = fit_plane(pts[inner])
    plane = lambda v: c[0] * v.co.x + c[1] * v.co.z + c[2]
    ok = [f for f in faces if abs(f.calc_center_median().y - (c[0]*f.calc_center_median().x + c[1]*f.calc_center_median().z + c[2])) < TOL_FACE]
    verts = {v for f in ok for v in f.verts}
    moved = 0
    for v in verts:
        if abs(v.co.y - plane(v)) < TOL_SNAP:
            v.co.y = plane(v); moved += 1
    print(label, "faces", len(ok), "verts snapped", moved, "plane", np.round(c, 5))
    return c
c_back = snap(lambda f: f.normal.y > 0.9, "back")
c_front = snap(lambda f: f.normal.y < -0.9 and f.calc_center_median().y > LETTER_FACE_Y, "front")
bmB.normal_update()
bmesh.ops.dissolve_limit(bmB, angle_limit=math.radians(1.0), use_dissolve_boundaries=False, verts=list(bmB.verts), edges=list(bmB.edges), delimit=set())
mB = bpy.data.meshes.new("flat_B"); bmB.to_mesh(mB); bmB.free()
mL = bpy.data.meshes.new("emblem_js_flat"); bmL.to_mesh(mL); bmL.free()
oL = bpy.data.objects.new("emblem_js_flat", mL); oB = bpy.data.objects.new("flat_B", mB)
coll.objects.link(oL); coll.objects.link(oB)
for o in vl.objects: o.select_set(False)
vl.objects.active = oB; oB.select_set(True)
# Planar по остальному (скругления, торцы), затем триангуляция
md = oB.modifiers.new("p", "DECIMATE"); md.decimate_type = "DISSOLVE"; md.angle_limit = math.radians(12); md.use_dissolve_boundaries = False
bpy.ops.object.modifier_apply(modifier="p")
mt = oB.modifiers.new("t", "TRIANGULATE"); mt.min_vertices = 4; mt.quad_method = "BEAUTY"; mt.ngon_method = "BEAUTY"
bpy.ops.object.modifier_apply(modifier="t")
for o in vl.objects: o.select_set(False)
oL.select_set(True); oB.select_set(True); vl.objects.active = oL
bpy.ops.object.join()
ob = oL
bm2 = bmesh.new(); bm2.from_mesh(ob.data); bmesh.ops.remove_doubles(bm2, verts=bm2.verts, dist=1e-6); bm2.to_mesh(ob.data); bm2.free()
me = ob.data

# --- UV по положению, материал ---
n = len(me.vertices); co = np.empty(n*3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(n, 3)
while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
uvl = me.uv_layers.new(name="UVMap")
vi = np.empty(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", vi)
u = 0.0005 + 0.999 * (co[vi, 0] - minx) / (maxx - minx); v = 0.0005 + 0.999 * (maxy - co[vi, 1]) / (maxy - miny)
uvl.data.foreach_set("uv", np.stack([u, v], 1).astype(np.float32).ravel())
me.materials.clear(); me.materials.append(bpy.data.materials["emblem_js_mat"])

# --- затенение: сглаживание по углу, но плоскости плоские ---
for o in vl.objects: o.select_set(False)
vl.objects.active = ob; ob.select_set(True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
pn = len(me.polygons)
nor = np.empty(pn*3, np.float32); me.polygons.foreach_get("normal", nor); nor = nor.reshape(pn, 3)
cen = np.empty(pn*3, np.float32); me.polygons.foreach_get("center", cen); cen = cen.reshape(pn, 3)
yb = c_back[0]*cen[:, 0] + c_back[1]*cen[:, 2] + c_back[2]
yf = c_front[0]*cen[:, 0] + c_front[1]*cen[:, 2] + c_front[2]
flat = ((nor[:, 1] > 0.99) & (np.abs(cen[:, 1] - yb) < 1e-5)) | ((nor[:, 1] < -0.99) & (np.abs(cen[:, 1] - yf) < 1e-5) & (cen[:, 1] > LETTER_FACE_Y))
smooth = np.array([p.use_smooth for p in me.polygons], dtype=bool)
smooth[flat] = False
me.polygons.foreach_set("use_smooth", smooth)
me.update()
ob.location = (-0.8, 0, 0)
print("RESULT tris", pn, "flat-shaded faces", int(flat.sum()))

# --- экспорт: только эмблема в начале координат ---
bpy.ops.wm.save_as_mainfile(filepath="D:/cursorTestProjects/mypage/assets-src/emblem_js_review.blend")
keep = ob
ob.location = (0, 0, 0)
tmp = bpy.data.scenes.new("export_tmp"); tmp.collection.objects.link(keep)
for o in list(bpy.data.objects):
    if o is not keep: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.window.scene = tmp if bpy.context.window else None
bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", use_selection=False, export_image_format="AUTO", export_apply=False)
print("EXPORTED", out_path)
