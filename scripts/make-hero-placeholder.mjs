// Делает крошечную версию фасада (hero) и вшивает её в components/heroPlaceholder.ts как data-URI.
// Она рисуется сразу, пока грузится настоящий кадр. Запуск: node scripts/make-hero-placeholder.mjs
// Источник берём из оригинала (assets-src/web-originals), если он есть.
import sharp from "sharp";
import fs from "node:fs";

const W = 128;
const orig = "assets-src/web-originals/facade/kit/hero.webp";
const src = fs.existsSync(orig) ? orig : "public/facade/kit/hero.webp";
const buf = await sharp(src).resize({ width: W }).webp({ quality: 45, alphaQuality: 70, effort: 6 }).toBuffer();
const meta = await sharp(buf).metadata();
const out = `// Сгенерировано scripts/make-hero-placeholder.mjs — не править вручную.
// Размытая заготовка фасада ${meta.width}×${meta.height}, ${(buf.length / 1024).toFixed(1)} КБ.
export const HERO_PLACEHOLDER = "data:image/webp;base64,${buf.toString("base64")}";
`;
fs.writeFileSync("components/heroPlaceholder.ts", out);
console.log(`${meta.width}x${meta.height}, ${buf.length} байт`);
