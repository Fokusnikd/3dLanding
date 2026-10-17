# Подготовка референса для эмблемы из слоёв: python scripts/prep_layers.py <ref_sheet.png> <out_prefix> [scale]
# Для каждого слоя (0 — подложка, 1 — красная маска, 2 — зелёная) делается своя копия вида спереди, где цвет слоя
# продолжен за его границы. Так небольшой промах проекции у края слоя не подтягивает цвет соседа.
# Копии и вид сзади лежат рядом в <prefix>_layers.png; прямоугольники силуэтов — в <prefix>_layers.json.
import sys, json
import numpy as np
from PIL import Image

sys.argv_backup = sys.argv
src, out = sys.argv[1], sys.argv[2]
scale = int(sys.argv[3]) if len(sys.argv) > 3 else 2

# общие функции подготовки (вырезание видов, ключ фона, заливка вырезов) берём из prep_ref
import importlib.util, os
spec = importlib.util.spec_from_file_location("prep_ref_mod", os.path.join(os.path.dirname(__file__), "prep_ref.py"))
sys.argv = [sys.argv[0], src, out + "_tmp", "1"]
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)  # выполнит prep_ref.py и создаст <out>_tmp_atlas.* (масштаб 1)
meta = json.load(open(out + "_tmp_atlas.json"))
atlas = np.array(Image.open(out + "_tmp_atlas.png").convert("RGB"))
fx, fy, fw, fh = meta["front"]
bx, by, bw, bh = meta["back"]
M = 24

def extend(col, known, iters=300):
    col = col.astype(np.float32)
    known = known.copy()
    H, W = known.shape
    for _ in range(iters):
        if known.all():
            break
        p = np.pad(known, 1, constant_values=False)
        pc = np.pad(col, ((1, 1), (1, 1), (0, 0)))
        acc = np.zeros_like(col)
        cnt = np.zeros(known.shape, np.float32)
        for dy in range(3):
            for dx in range(3):
                kn = p[dy:dy + H, dx:dx + W]
                acc += pc[dy:dy + H, dx:dx + W] * kn[..., None]
                cnt += kn
        grow = (~known) & (cnt > 0)
        col[grow] = acc[grow] / cnt[grow][..., None]
        known |= grow
    return col

def erode(m, n=2):
    for _ in range(n):
        p = np.pad(m, 1, constant_values=False)
        m = m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m

def crop_tile(img, x, y, w, h):
    # плитка = рамка силуэта + поле M с каждой стороны (цвет в поле уже продолжен)
    H, W = img.shape[:2]
    pad = np.pad(img, ((M, M), (M, M), (0, 0)), mode="edge")
    return pad[y:y + h + 2 * M, x:x + w + 2 * M]

front = atlas[:, :, :]
fr = front[fy - 0:fy + fh, fx:fx + fw].astype(np.int16)
r, g, b = fr[..., 0], fr[..., 1], fr[..., 2]
cls = np.zeros(fr.shape[:2], np.int8)
cls[(r > g + 40) & (r > b + 40)] = 1
cls[(g > r + 25) & (g > b + 25)] = 2

# работаем на области силуэта + поля: берём кусок атласа с запасом, вне силуэта цвет уже продолжен prep_ref
big = np.pad(atlas[:, :, :], ((0, 0), (0, 0), (0, 0)))
def region(x, y, w, h):
    ys0, xs0 = max(0, y - M), max(0, x - M)
    ys1, xs1 = min(atlas.shape[0], y + h + M), min(atlas.shape[1], x + w + M)
    out_ = np.zeros((h + 2 * M, w + 2 * M, 3), np.uint8)
    out_[ys0 - (y - M):ys0 - (y - M) + (ys1 - ys0), xs0 - (x - M):xs0 - (x - M) + (xs1 - xs0)] = atlas[ys0:ys1, xs0:xs1]
    return out_

tile_f = region(fx, fy, fw, fh).astype(np.int16)
r, g, b = tile_f[..., 0], tile_f[..., 1], tile_f[..., 2]
tcls = np.zeros(tile_f.shape[:2], np.int8)
tcls[(r > g + 40) & (r > b + 40)] = 1
tcls[(g > r + 25) & (g > b + 25)] = 2
tile_f = tile_f.astype(np.uint8)

tiles = []
for k in (0, 1, 2):
    known = erode(tcls == k, 2)
    tiles.append(extend(tile_f, known).astype(np.uint8))
tile_b = region(bx, by, bw, bh)
tiles.append(tile_b)

th = max(t.shape[0] for t in tiles)
tw = sum(t.shape[1] for t in tiles)
canvas = np.zeros((th, tw, 3), np.uint8)
x = 0
rects = []
for t in tiles:
    canvas[:t.shape[0], x:x + t.shape[1]] = t
    rects.append([x + M, M, t.shape[1] - 2 * M, t.shape[0] - 2 * M])
    x += t.shape[1]
im = Image.fromarray(canvas)
if scale != 1:
    im = im.resize((canvas.shape[1] * scale // 1, canvas.shape[0] * scale // 1), Image.LANCZOS)
im.save(out + "_layers.png")
json.dump({"size": [im.width, im.height], "tiles": [[v * scale for v in r_] for r_ in rects]}, open(out + "_layers.json", "w"))
print("layers", im.size, rects)
