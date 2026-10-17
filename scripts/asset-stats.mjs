// Считает реальные цифры оптимизации для экрана «Электрощиток» и пишет их в lib/assetStats.json.
// Оригиналы лежат в assets-src (models, web-originals), то, что отдаёт сайт, — в public. Запуск: npm run stats:assets
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { read as readKtx2 } from "ktx-parse";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const walk = (d) =>
  fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : [];
const size = (f) => fs.statSync(f).size;
const sum = (files) => files.reduce((a, f) => a + size(f), 0);

// ───── модели: оригинал из assets-src/models → то, что лежит в public/models ─────
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
async function triangles(file) {
  const doc = await io.read(file);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      tris += Math.round((idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3);
    }
  }
  return tris;
}
const models = [];
for (const f of walk("public/models").filter((f) => f.endsWith(".glb")).sort()) {
  const name = path.basename(f);
  const src = path.join("assets-src/models", name);
  models.push({
    name: name.replace(/\.glb$/, ""),
    beforeBytes: fs.existsSync(src) ? size(src) : null,
    afterBytes: size(f),
    trisBefore: fs.existsSync(src) ? await triangles(src) : null,
    trisAfter: await triangles(f),
  });
}

// ───── фасад: оригиналы (PNG/JPG) → WebP нужного размера ─────
const facadeBefore = walk("assets-src/web-originals/facade");
const facadeAfter = walk("public/facade").filter((f) => f.endsWith(".webp"));

// ───── текстуры зала: JPG → WebP → KTX2. Сайт грузит KTX2 (кроме цвета panel — он остаётся WebP) ─────
const SETS = ["hall_wall", "hall_floor", "marble", "walnut", "panel"];
const WEBP_DIFF = ["panel"];
let jpgBytes = 0;
let webpBytes = 0;
let shippedBytes = 0;
let vramRaw = 0;
let vramCompressed = 0;
let maps = 0;
for (const set of SETS) {
  for (const map of ["diff", "nor", "rough", "ao"]) {
    const orig = path.join("assets-src/web-originals/textures", set, `${map}.jpg`);
    const webp = path.join("public/textures", set, `${map}.webp`);
    const ktx = path.join("public/textures", set, `${map}.ktx2`);
    jpgBytes += size(orig);
    webpBytes += size(webp);
    const useWebp = map === "diff" && WEBP_DIFF.includes(set);
    shippedBytes += size(useWebp ? webp : ktx);
    maps++;
    const meta = await sharp(webp).metadata();
    const mip = 4 / 3;
    vramRaw += meta.width * meta.height * 4 * mip; // распакованный RGBA8 с мипами
    if (useWebp) vramCompressed += meta.width * meta.height * 4 * mip;
    else {
      const k = readKtx2(new Uint8Array(fs.readFileSync(ktx)));
      vramCompressed += k.pixelWidth * k.pixelHeight * 1 * mip; // BC7 / ASTC 4×4: 1 байт на пиксель
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  models,
  facade: { files: facadeAfter.length, beforeBytes: sum(facadeBefore), afterBytes: sum(facadeAfter) },
  textures: { maps, sets: SETS.length, jpgBytes, webpBytes, shippedBytes, vramRawBytes: Math.round(vramRaw), vramCompressedBytes: Math.round(vramCompressed) },
};
fs.writeFileSync("lib/assetStats.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
