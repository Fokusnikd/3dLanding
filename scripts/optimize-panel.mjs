// Готовит текстуры электрощитка из assets-src/breaker_box (картинки из ChatGPT, см. orders/electric-panel-chatgpt.md)
// в public/textures/breaker_box. Запуск: npm run optimize:panel
//  · материалы: albedo → WebP, normal считается из карты высоты (с обёрткой по краям, чтобы плитка не давала шва);
//    в крашеную сталь «запекается» маска износа (сколы открывают металл);
//  · наклейки и автоматы: пурпурный фон #FF00FF вырезается в альфа-канал, листы режутся на отдельные файлы;
//  · стекло дисплея, схема и грязь стены: WebP / PNG с альфой.
import sharp from "sharp";
import fs from "node:fs";

const SRC = "assets-src/breaker_box";
const OUT = "public/textures/breaker_box";
fs.mkdirSync(OUT, { recursive: true });
const clamp = (v, a = 0, b = 255) => Math.min(b, Math.max(a, v));
const ALPHA_WEBP = { quality: 82, alphaQuality: 90, effort: 6 };

const rgb = async (file, size) => {
  const img = sharp(`${SRC}/${file}`).removeAlpha();
  if (size) img.resize(size, size, { fit: "fill" });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const grey = async (file, size) => {
  const { data } = await sharp(`${SRC}/${file}`).resize(size, size, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
};
const saveWebp = (data, w, h, ch, file, q = 84) =>
  sharp(data, { raw: { width: w, height: h, channels: ch } }).webp({ quality: q, effort: 6 }).toFile(`${OUT}/${file}`);

// normal из высоты: фильтр Собеля с обёрткой по краям
function normalFromHeight(g, size, strength) {
  const out = Buffer.alloc(size * size * 3);
  const at = (x, y) => g[((y + size) % size) * size + ((x + size) % size)] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength;
      let ny = dy * strength; // v растёт вверх, а строки картинки вниз
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * size + x) * 3;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
    }
  }
  return out;
}

const report = [];
// size — размер цвета; normalSize — размер карты нормалей (0 — нормали не нужны: деталь мелкая, рельеф не виден)
async function material(name, albedoFile, heightFile, size, normalSize, strength, bake, q = 80) {
  const a = await rgb(albedoFile, size);
  const h = await grey(heightFile, size);
  if (bake) bake(a.data, h);
  await saveWebp(a.data, size, size, 3, `${name}_albedo.webp`, q);
  if (normalSize) {
    const hn = normalSize === size ? h : await grey(heightFile, normalSize);
    if (bake && normalSize !== size) {
      // износ запекается и в высоту, поэтому для уменьшенной карты считаем её заново из уменьшенной маски
      const w = await grey("wear_mask.png", normalSize);
      for (let i = 0; i < hn.length; i++) hn[i] = hn[i] * (1 - 0.45 * clamp((w[i] / 255) * 1.25, 0, 1) * 0.85);
    }
    await saveWebp(normalFromHeight(hn, normalSize, strength), normalSize, normalSize, 3, `${name}_normal.webp`, 78);
  }
  report.push(`${name}: цвет ${size}², нормали ${normalSize ? normalSize + "²" : "нет"}`);
}

// ───── крашеная сталь: запекаем износ (маска износа бесшовная 1024 и совпадает по размеру) ─────
const wear = await grey("wear_mask.png", 1024);
const METAL = [172, 178, 172]; // голый металл под краской
await material("steel", "steel_paint.png", "steel_paint_height.png", 1024, 512, 3.2, (alb, h) => {
  for (let i = 0; i < wear.length; i++) {
    const m = clamp((wear[i] / 255) * 1.25, 0, 1) * 0.85;
    for (let c = 0; c < 3; c++) alb[i * 3 + c] = alb[i * 3 + c] * (1 - m) + METAL[c] * m;
    h[i] = h[i] * (1 - 0.45 * m);
  }
});
// плита занимает плитку 0.22 м: 512 px дают ~23 px/см, как у краски в 1024 на 0.5 м
await material("zinc", "zinc_plate.jpg", "zinc_plate_height.png", 512, 512, 2.4);
// замок, пластик и автоматы — мелкие детали: цвета в 512 хватает, рельеф берёт на себя roughness
await material("brass", "brass.jpg", "brass_height.png", 512, 0, 0);
await material("black", "plastic_black.png", "plastic_black_height.png", 512, 0, 0);
// beige пластик (plastic_beige.png) в сцене не нужен: цвет корпусов автоматов задан плоским, лицевые панели — из атласа

// ───── вырезание пурпурного фона в альфу (с «расчисткой» магентового ореола на краях) ─────
async function keyed(file) {
  const { data: src, info } = await sharp(`${SRC}/${file}`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = src[i * 3], g = src[i * 3 + 1], b = src[i * 3 + 2];
    const d = Math.hypot(255 - r, g, 255 - b); // расстояние до #FF00FF
    const a = clamp((d - 70) / 90, 0, 1);
    out[i * 4 + 3] = a * 255;
    if (a > 0) {
      out[i * 4] = clamp((r - (1 - a) * 255) / a);
      out[i * 4 + 1] = clamp(g / a);
      out[i * 4 + 2] = clamp((b - (1 - a) * 255) / a);
    }
  }
  return { data: out, w, h };
}
function bbox({ data, w, h }, thr = 40) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}
const crop = (img, b) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } }).extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1 });
// диапазоны столбцов, где есть содержимое (разрыв больше gap — граница между предметами)
function columnRuns(img, gap = 3) {
  const { data, w, h } = img;
  const has = new Array(w).fill(false);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] > 40) { has[x] = true; break; }
  const runs = [];
  let s = -1, last = -1;
  for (let x = 0; x < w; x++) {
    if (has[x]) { if (s < 0) s = x; last = x; }
    else if (s >= 0 && x - last > gap) { runs.push([s, last]); s = -1; }
  }
  if (s >= 0) runs.push([s, last]);
  return runs;
}
function sliceCols(img, [a, b]) {
  const { data, w, h } = img;
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < h; y++) for (let x = a; x <= b; x++) { const i = (y * w + x) * 4; out[i] = data[i]; out[i + 1] = data[i + 1]; out[i + 2] = data[i + 2]; out[i + 3] = data[i + 3]; }
  return out;
}

// наклейки: пять предметов в ряд
{
  const img = await keyed("door_decals.png");
  const runs = columnRuns(img);
  const names = ["triangle", "nameplate", "highvoltage", "earth", "blank"];
  if (runs.length !== names.length) throw new Error(`door_decals: ожидалось ${names.length} наклеек, найдено ${runs.length}`);
  for (let i = 0; i < names.length; i++) {
    const part = { data: sliceCols(img, runs[i]), w: img.w, h: img.h };
    await crop(part, bbox(part)).webp(ALPHA_WEBP).toFile(`${OUT}/decal_${names[i]}.webp`);
  }
  report.push(`decals: ${names.join(", ")}`);
}

// автоматы: шесть модулей без зазоров, ширины 1:1:1:2:1:2. Остаются ОДНИМ атласом (одна текстура и один меш на все модули):
// колонки атласа пропорциональны ширинам модулей, в коде (ElectricPanel) UV берутся по тем же долям
{
  const img = await keyed("breaker_faces.png");
  const b = bbox(img);
  await crop(img, b).resize({ width: 732 }).webp(ALPHA_WEBP).toFile(`${OUT}/breaker_atlas.webp`);
  report.push(`breaker_atlas: ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1} → 732 по ширине`);
}

// DIN-рейка: полоса без фона; на рейке повторяется ~7 раз, поэтому половины разрешения хватает
{
  const img = await keyed("din_rail.jpg");
  const b = bbox(img);
  await crop(img, b).resize({ width: 632 }).webp(ALPHA_WEBP).toFile(`${OUT}/din_rail.webp`);
  report.push(`din_rail: ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1} → 632 по ширине`);
}

// схема на дверце (дверца 1.29 × 0.89 м: 1024 px по ширине дают ~8 px/см) и стекло дисплея
await sharp(`${SRC}/schematic_sticker.png`).resize({ width: 1024 }).webp({ quality: 82, effort: 6 }).toFile(`${OUT}/schematic.webp`);
await sharp(`${SRC}/glass_smudge.png`).greyscale().webp({ quality: 78, effort: 6 }).toFile(`${OUT}/glass_smudge.webp`);

// карта загрязнения стены (wall_grime.png) не используется: грязь вокруг щитка убрали, оригинал остаётся в assets-src

console.log(report.join("\n"));
let bytes = 0;
for (const f of fs.readdirSync(OUT)) bytes += fs.statSync(`${OUT}/${f}`).size;
console.log(`итого в ${OUT}: ${fs.readdirSync(OUT).length} файлов, ${(bytes / 1048576).toFixed(2)} МБ`);
