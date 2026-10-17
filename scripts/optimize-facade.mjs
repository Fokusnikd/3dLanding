// Ужимает текстуры фасада под бюджет видеопамяти. Всегда кодирует из резервной копии assets-src/facade-before/
// (создаётся при первом запуске из текущих public/facade), поэтому скрипт можно гонять повторно без потери качества.
// Запуск: node scripts/optimize-facade.mjs
// Размеры подобраны по тому, как текстуры показаны в сцене (метры на пиксель), а не «на всякий случай».
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const BACKUP = "assets-src/facade-before";
const ROOT = "public/facade/kit";

// файл → [ширина, качество]; высота по пропорциям. Нормали сжимаем мягче, но в меньшем разрешении.
const PLAN = {
  "hero.webp": [2048, 80],
  "hero_normal.webp": [1024, 82],
  "door_outer.webp": [776, 84],
  "door_inner.webp": [650, 84],
  "door_transom.webp": [1210, 84],
  "door_outer_normal.webp": [456, 85],
  "side_ground.webp": [512, 72],
  "side_upper.webp": [512, 72],
  "sidewalk.webp": [768, 72],
  "asphalt.webp": [512, 70],
  "columns/column_shaft.webp": [768, 82],
  "columns/column_base.webp": [904, 84],
  "columns/column_capital.webp": [925, 84],
};

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
if (!fs.existsSync(BACKUP)) {
  for (const f of walk("public/facade")) {
    const dst = path.join(BACKUP, path.relative("public/facade", f));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(f, dst);
  }
  console.log("резервная копия:", BACKUP);
}

const mb = (w, h) => ((w * h * 4 * 4) / 3 / 1048576).toFixed(1);
for (const [name, [width, quality]] of Object.entries(PLAN)) {
  const input = fs.readFileSync(path.join(BACKUP, "kit", name));
  const meta = await sharp(input).metadata();
  const out = await sharp(input)
    .resize({ width, kernel: "lanczos3" })
    .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  fs.writeFileSync(path.join(ROOT, name), out);
  const h = Math.round((meta.height * width) / meta.width);
  console.log(`${name.padEnd(30)} ${meta.width}x${meta.height} ${(input.length / 1024) | 0}KB ${mb(meta.width, meta.height)}MB -> ${width}x${h} ${(out.length / 1024) | 0}KB ${mb(width, h)}MB`);
}
