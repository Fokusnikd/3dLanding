# Подготовка референса: python scripts/prep_ref.py <ref_sheet.png> <out_prefix> [scale]
# Лист 1536x1024, 2x2: слева сверху — вид спереди, слева снизу — сзади. Фон #00FF00.
# Результат: <prefix>_atlas.png (спереди и сзади рядом, зелёный убран, увеличено) и <prefix>_atlas.json (прямоугольники силуэтов).
import sys, json
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
scale = int(sys.argv[3]) if len(sys.argv) > 3 else 3
im = np.array(Image.open(src).convert("RGB")).astype(np.int16)
H, W = im.shape[:2]
cw, ch = W // 2, H // 2

def green_of(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    # фон — чистый #00FF00; зелёная маска Playwright (≈ 90,187,108) под ключ не попадает
    return (g > 215) & (r < 75) & (b < 75)

def shift_or(m):
    p = np.pad(m, 1, constant_values=False)
    return m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]

def background(green):
    # зелёный фон снаружи: связан с краем кадра. Зелёное внутри силуэта (вырезы масок) — не фон
    bg = np.zeros_like(green)
    bg[0, :] = green[0, :]; bg[-1, :] = green[-1, :]; bg[:, 0] = green[:, 0]; bg[:, -1] = green[:, -1]
    while True:
        nxt = shift_or(bg) & green
        if (nxt == bg).all():
            return bg
        bg = nxt

def cell(x0, y0, hole_color=None):
    c = im[y0:y0 + ch, x0:x0 + cw]
    green = green_of(c)
    bg = background(green)
    holes = green & ~bg
    # кромка силуэта смешана с зелёным: съедаем её на 2 пикселя
    solid = ~green
    for _ in range(2):
        p = np.pad(solid, 1, constant_values=False)
        solid = solid & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    ys, xs = np.where(solid)
    x1, x2, y1, y2 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    col = c.astype(np.float32)
    known = solid.copy()
    if hole_color is not None and holes.any():
        for _ in range(2):  # вырезы чуть шире, чтобы убрать зелёную кайму
            holes = shift_or(holes) & ~solid | holes
        col[holes] = hole_color
        known |= holes
    # заливка фона вокруг силуэта цветом ближайших закрашенных пикселей, чтобы на краях не просачивался зелёный
    for _ in range(400):
        if known.all():
            break
        p = np.pad(known, 1, constant_values=False)
        pc = np.pad(col, ((1, 1), (1, 1), (0, 0)))
        acc = np.zeros_like(col)
        cnt = np.zeros(known.shape, np.float32)
        for dy in range(3):
            for dx in range(3):
                kn = p[dy:dy + ch, dx:dx + cw]
                acc += pc[dy:dy + ch, dx:dx + cw] * kn[..., None]
                cnt += kn
        grow = (~known) & (cnt > 0)
        col[grow] = acc[grow] / cnt[grow][..., None]
        known |= grow
    return col.astype(np.uint8), (x1, y1, x2 - x1, y2 - y1), solid

# вид сзади обычно ровный: его медианный цвет — цвет подложки для вырезов на виде спереди
back, bb, bsolid = cell(0, ch)
hole = np.median(back[bsolid], axis=0)
front, fb, _ = cell(0, 0, hole)
M = 12  # поле вокруг силуэта в пикселях
def crop(img, b):
    x, y, w, h = b
    x0, y0 = max(0, x - M), max(0, y - M)
    x1, y1 = min(cw, x + w + M), min(ch, y + h + M)
    sub = Image.fromarray(img[y0:y1, x0:x1]).resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.LANCZOS)
    return sub, ((x - x0) * scale, (y - y0) * scale, w * scale, h * scale)

fi, fr = crop(front, fb)
bi, br = crop(back, bb)
AW, AH = fi.width + bi.width, max(fi.height, bi.height)
atlas = Image.new("RGB", (AW, AH), (0, 0, 0))
atlas.paste(fi, (0, 0))
atlas.paste(bi, (fi.width, 0))
atlas.save(out + "_atlas.png")
json.dump(
    {
        "size": [AW, AH],
        "front": [fr[0], fr[1], fr[2], fr[3]],
        "back": [fi.width + br[0], br[1], br[2], br[3]],
    },
    open(out + "_atlas.json", "w"),
)
print("atlas", AW, AH, "front", fr, "back", br)
