// Оптимизация GLB (по умолчанию без потерь: meshopt + WebP, без упрощения): оригиналы лежат в assets-src/models, результат пишется в public/models.
// Эмблемы: упрощение до ~15% треугольников в Blender, запекание цвета в текстуру 2048 и очистка цвета до плоской
// палитры без запечённых теней (scripts/bake_emblem.py). Остальные модели: только сжатие.
// У всех — meshopt для геометрии и WebP для текстур. Декодер meshopt подключается в drei useGLTF по умолчанию.
// Путь к Blender можно задать переменной BLENDER.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = "assets-src/models";
const OUT = "public/models";
const BLENDER = process.env.BLENDER ?? "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe";
const TMP = join(tmpdir(), "mypage-bake");
mkdirSync(TMP, { recursive: true });

// k — число цветов для кластеризации; map — [найденный цвет, чистый цвет альбедо] (sRGB, 0–255)
const EMBLEMS = {
  "emblem_js.glb": {
    k: 5,
    map: [
      [[107, 103, 103], [58, 58, 62]],
      [[80, 72, 61], [24, 24, 26]],
      [[242, 241, 241], [236, 236, 238]],
      [[250, 229, 111], [248, 217, 72]],
      [[248, 216, 68], [248, 217, 72]],
    ],
  },
  "emblem_next.glb": {
    k: 6,
    map: [
      [[246, 244, 244], [236, 236, 240]],
      [[197, 196, 196], [236, 236, 240]],
      [[140, 138, 139], [226, 226, 230]],
      [[111, 108, 108], [44, 44, 47]],
      [[93, 90, 90], [44, 44, 47]],
      [[80, 76, 76], [44, 44, 47]],
    ],
  },
  "emblem_playwright.glb": {
    k: 6,
    map: [
      [[224, 139, 122], [228, 136, 116]],
      [[171, 118, 96], [228, 136, 116]],
      [[90, 187, 108], [96, 196, 114]],
      [[140, 216, 140], [96, 196, 114]],
      [[104, 139, 154], [78, 110, 124]],
      [[90, 122, 124], [78, 110, 124]],
    ],
  },
};

const run = (cmd, args, env = {}) => execFileSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });

// Эмблемы собраны вручную из Blender-источников (assets-src/*.blend, scripts/build_*.py, color_playwright_hy_tex.py) и установлены
// в public/models напрямую; исходники в assets-src/models для них «сырые» (сотни тысяч треугольников), поэтому пропускаем,
// иначе скрипт перезапишет готовые лёгкие эмблемы тяжёлыми оригиналами.
// Статуи тоже пересозданы: граф ComfyUI (Pixal3D + TRELLIS.2, assets-src/statue_graphs) с целью 20 тыс. граней, цвет/нормали/AO запечены
// в текстуры 2048 и уменьшены до 512, затем Blender: выравнивание основания, рост 1.2/1.3/1.7 м; сырые результаты в assets-src/statues_new.
const HAND_MADE = new Set([
  "emblem_js.glb",
  "emblem_next.glb",
  "emblem_playwright.glb",
  "statue_games.glb",
  "statue_fencing.glb",
  "statue_climbing.glb",
  "statue_boardgames.glb",
]);

for (const f of readdirSync(SRC).filter((n) => n.endsWith(".glb"))) {
  if (HAND_MADE.has(f) && !process.env.BAKE_EMBLEMS) {
    console.log(`${f}: пропущено (установлена вручную, см. комментарий в скрипте)`);
    continue;
  }
  console.log(f);
  let input = `${SRC}/${f}`;
  let textureSize = null;
  // статуи: упрощение с учётом UV и нормалей до 45% (≈54 тыс. треугольников) и текстуры 1024 (scripts/simplify-statue.mjs)
  if (f.startsWith("statue_")) {
    input = join(TMP, f);
    run("node", ["scripts/simplify-statue.mjs", `${SRC}/${f}`, input, "0.45", "1024"], { UV_W: "2", NORMAL_W: "1", ERROR: "0.1" });
    textureSize = "1024";
  }
  // запекание и упрощение эмблем — по запросу (BAKE_EMBLEMS=1): оно портит цвет, по умолчанию эмблемы сжимаются без потерь
  const cfg = process.env.BAKE_EMBLEMS ? EMBLEMS[f] : undefined;
  if (cfg) {
    input = join(TMP, f);
    run(BLENDER, ["-b", "-P", "scripts/bake_emblem.py", "--", `${SRC}/${f}`, input, "0.15", "2048", String(cfg.k)], {
      PALETTE_MAP: JSON.stringify(cfg.map),
      SMOOTH: "4",
    });
  }
  run("npx", ["gltf-transform", "optimize", input, `${OUT}/${f}`, "--compress", "meshopt", "--simplify", "false", "--texture-compress", "webp", ...(textureSize ? ["--texture-size", textureSize] : [])], {});
}
