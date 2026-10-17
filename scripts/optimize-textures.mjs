// Пережимает картинки public/facade и public/textures в WebP (разрешение не меняется).
// Оригиналы сохраняются в assets-src/web-originals/ (если там их ещё нет), старые файлы удаляются.
// Запуск: node scripts/optimize-textures.mjs   (после — пути в коде должны указывать на .webp)
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const BACKUP = "assets-src/web-originals";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// Качество по назначению. Нормали чувствительны к артефактам, AO и roughness почти не видны, детали с альфой
// держим повыше ради краёв, а тайлящийся фон (тротуар, асфальт) и фасад-«hero» можно жать сильнее.
function quality(f) {
  if (/\/hero_normal\./.test(f)) return 78;
  if (/(_normal|\/nor)\.\w+$/.test(f)) return 85;
  if (/\/(ao|rough)\.\w+$/.test(f)) return 65;
  if (/\/hero\./.test(f)) return 80;
  if (/\/(sidewalk|asphalt|side_ground|side_upper)\./.test(f)) return 70;
  if (/\/(door_|columns\/|hall\/|handle_)/.test(f)) return 84;
  return 76;
}

let before = 0;
let after = 0;
for (const src of walk("public").filter((f) => /\.(png|jpe?g|webp)$/i.test(f) && /public[\\/](facade|textures)[\\/]/.test(f))) {
  const f = src.replace(/\\/g, "/");
  const dst = f.replace(/\.\w+$/, ".webp");
  // если оригинал уже в резервной копии, кодируем из него, а не из прошлого результата (без двойной потери качества)
  const bakOrig = path.join(BACKUP, f.replace(/^public\//, ""));
  const bakByStem = [".png", ".jpg", ".jpeg", ".webp"].map((e) => bakOrig.replace(/\.\w+$/, e)).find((p) => fs.existsSync(p));
  const input = fs.readFileSync(bakByStem ?? src);
  const encoded = await sharp(input).webp({ quality: quality(f), alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
  // оригинал, который уже был webp, оставляем как есть, если пережатие не даёт выигрыша
  const origIsWebp = /\.webp$/i.test(bakByStem ?? src);
  const out = origIsWebp && encoded.length >= input.length ? input : encoded;
  if (!bakByStem) {
    fs.mkdirSync(path.dirname(bakOrig), { recursive: true });
    fs.writeFileSync(bakOrig, input);
  }
  fs.writeFileSync(dst, out);
  if (dst !== f) fs.unlinkSync(src);
  before += input.length;
  after += out.length;
  console.log(`${Math.round(input.length / 1024)}KB -> ${Math.round(out.length / 1024)}KB ${dst}`);
}
console.log(`\nИтого: ${(before / 1048576).toFixed(1)} МБ -> ${(after / 1048576).toFixed(1)} МБ`);
