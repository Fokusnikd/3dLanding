// Печатает размеры, формат и наличие прозрачности у всех картинок public/facade и public/textures
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of [...walk("public/facade"), ...walk("public/textures")].filter((f) => /\.(png|jpe?g|webp)$/.test(f))) {
  const m = await sharp(f).metadata();
  let a = "";
  if (m.hasAlpha) {
    const s = await sharp(f).stats();
    a = ` alphaMin=${s.channels[3].min}`;
  }
  console.log(`${Math.round(fs.statSync(f).size / 1024)}KB ${m.width}x${m.height} ${m.format}${a} ${f.replace(/\\/g, "/")}`);
}
