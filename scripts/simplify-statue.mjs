// Упрощение статуи с учётом UV и нормалей: node scripts/simplify-statue.mjs <in.glb> <out.glb> <доля треугольников, 0.25> [размер текстур, 1024]
// Простое упрощение по позициям (gltf-transform simplify) сдвигает UV и смазывает текстуру на лице и швах,
// поэтому здесь используется simplifyWithAttributes из meshoptimizer: UV и нормали входят в ошибку схлопывания.
// Результат пишется без сжатия (удобно открыть в Blender); сжатие meshopt/WebP делается отдельным шагом gltf-transform optimize.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, compactPrimitive, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [inPath, outPath, ratioArg = "0.25", sizeArg = "1024"] = process.argv.slice(2);
const ratio = Number(ratioArg);
const texSize = Number(sizeArg);
const UV_W = Number(process.env.UV_W ?? 1.0);       // вес UV в ошибке (позиции нормированы на размер модели)
const NORMAL_W = Number(process.env.NORMAL_W ?? 0.5);
const ERROR = Number(process.env.ERROR ?? 0.05);

await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(inPath);
await doc.transform(weld());

for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const nrm = prim.getAttribute("NORMAL");
    const uv = prim.getAttribute("TEXCOORD_0");
    const idx = prim.getIndices();
    const indices = Uint32Array.from(idx.getArray());
    const n = pos.getCount();
    const attrs = new Float32Array(n * 5);
    const p = new Float32Array(pos.getArray());
    const nn = nrm.getArray();
    const u = uv.getArray();
    for (let i = 0; i < n; i++) {
      attrs[i * 5] = u[i * 2];
      attrs[i * 5 + 1] = u[i * 2 + 1];
      attrs[i * 5 + 2] = nn[i * 3];
      attrs[i * 5 + 3] = nn[i * 3 + 1];
      attrs[i * 5 + 4] = nn[i * 3 + 2];
    }
    // вершины на швах UV (одна позиция - несколько вершин) не схлопываем: иначе шов рвётся и на текстуре появляются тёмные крошки
    let lock = null;
    if (process.env.LOCK_SEAMS !== "0") {
      const remap = MeshoptSimplifier.generatePositionRemap(p, 3);
      const cnt = new Uint32Array(n);
      for (let i = 0; i < n; i++) cnt[remap[i]]++;
      lock = new Uint8Array(n);
      let locked = 0;
      for (let i = 0; i < n; i++) if (cnt[remap[i]] > 1) { lock[i] = 1; locked++; }
      console.log(`вершин на швах UV (заблокировано): ${locked} из ${n}`);
    }
    const scale = MeshoptSimplifier.getScale(p, 3);
    const target = Math.floor((indices.length * ratio) / 3) * 3;
    const [out, err] = MeshoptSimplifier.simplifyWithAttributes(indices, p, 3, attrs, 5, [UV_W * scale, UV_W * scale, NORMAL_W, NORMAL_W, NORMAL_W], lock, target, ERROR, []);
    idx.setArray(new Uint32Array(out));
    compactPrimitive(prim);
    console.log(`${mesh.getName()}: ${indices.length / 3} -> ${out.length / 3} треугольников, ошибка ${err.toFixed(5)} (масштаб ${scale.toFixed(3)})`);
  }
}
await doc.transform(prune());
if (texSize > 0) {
  await doc.transform(textureCompress({ encoder: sharp, resize: [texSize, texSize] }));
}
await io.write(outPath, doc);
console.log("записано", outPath);
