# python scripts/make_palette.py <ref_sheet.png> <out_prefix> js — берёт точные цвета из листа референса и пишет палитру-текстуру
import sys, json
import numpy as np
from PIL import Image
src, out, kind = sys.argv[1:4]
im = np.array(Image.open(src).convert("RGB")).astype(np.int16)
H, W = im.shape[:2]
front = im[: H // 2, : W // 2]
back = im[H // 2:, : W // 2]
r, g, b = front[..., 0], front[..., 1], front[..., 2]
yellow = (r > 200) & (g > 140) & (b < 120) & (r > b + 120)
ys, xs = np.where(yellow)
cx = (xs.min() + xs.max()) / 2
left = np.median(front[yellow & (np.arange(front.shape[1])[None, :] < cx - 6)], axis=0)
right = np.median(front[yellow & (np.arange(front.shape[1])[None, :] > cx + 6)], axis=0)
dark = np.median(front[(r < 70) & (g < 70) & (b < 70)], axis=0)
white = np.median(front[(r > 225) & (g > 225) & (b > 225)], axis=0)
br, bg_, bb = back[..., 0], back[..., 1], back[..., 2]
byel = (br > 200) & (bg_ > 140) & (bb < 120)
back_c = np.median(back[byel], axis=0)
cols = {"shield_left": left, "shield_right": right, "J": dark, "S": white, "back": back_c}
print({k: [int(x) for x in v] for k, v in cols.items()})
# палитра 2048x2048: четыре горизонтальные полосы по 512 строк (щит — две половины, J, S, тыл).
# Полосы высокие, чтобы видеокарта при уменьшении текстуры (mip-уровни) не смешивала их между собой.
pal = np.zeros((2048, 2048, 3), np.uint8)
pal[0:512, :1024], pal[0:512, 1024:] = left, right
pal[512:1024] = dark
pal[1024:1536] = white
pal[1536:2048] = back_c
Image.fromarray(pal).save(out + "_palette.png")
json.dump({k: [int(x) for x in v] for k, v in cols.items()}, open(out + "_palette.json", "w"))
