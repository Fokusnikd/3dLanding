"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ═════════════ НАСТРОЙКИ ТУМАНА ЗАГРУЗКИ — подкручивайте здесь ═════════════
// Объёмный туман сцены (обычный fog three): густой вдали и редеющий в глубину. В начале всё, что дальше FOG_FAR_START метров от
// камеры, скрыто полностью; по мере загрузки границы тумана раздвигаются до финальных (FOG_NEAR_END / FOG_FAR_END).
// Порядок проявления идёт от ближнего к дальнему: дорога (туман сцены сходится в узкую полосу FOG_NEAR_ROAD…FOG_FAR_ROAD) → фонари → колонны → здание.
// Фонари и колонны стоят близко к стене, поэтому проступают отдельно (у них свой туман в материале), каждые по своему окну.
// Одна плавная кривая: сплошной туман, ничего не видно → грузится дорога и проступает → фонари → без паузы колонны →
// туман в глубине редеет, здание слегка видно → туман уходит совсем.
// Прогресс тумана P идёт от 0 до 1 за FOG_SEC секунд, но не обгоняет загрузку: пока этап не готов, P ждёт на потолке.
const FOG_SEC = 8; // за сколько секунд туман проходит весь путь, если ничего не ждёт загрузку (больше — медленнее проявление)
const START_DELAY = 0.3; // пауза после готовности дороги, прежде чем туман начнёт редеть
const ROAD = [0, 0.15]; // окно проявления дороги и тротуара по P (туман сцены становится узкой полосой FOG_NEAR_ROAD…FOG_FAR_ROAD)
const LANTERNS = [0.15, 0.42]; // окно фонарей по P: [когда начинают, когда полностью чёткие]
const COLUMNS = [0.28, 0.55]; // окно колонн (начинают ещё до того, как фонари полностью проявились: без паузы между ними)
const WALL_FOG = [0.5, 1]; // окно, в котором туман сцены расходится дальше: проступают здание, дверь
const FOG_CURVE = 1; // форма: 1 — равномерно, больше — туман в глубине сначала держится плотнее и быстрее уходит к концу
const FOG_NEAR_START = 1; // в начале туман начинается в метре от камеры...
const FOG_FAR_START = 5; // ...и на расстоянии 5 м скрывает всё полностью (стена фасада стоит в ~14 м)
// Когда дорога проступила, туман сцены остаётся узкой полосой: всё ближе FOG_NEAR_ROAD метров (дорога) чистое, тротуар (9–14 м от
// камеры) проступает почти целиком, а здание (~14 м) ещё скрыто. Чем ближе к стене, тем гуще дымка: начало тротуара заметно раньше колонн.
const FOG_NEAR_ROAD = 9.3;
const FOG_FAR_ROAD = 14.2;
const FOG_NEAR_END = 20; // финальные границы тумана сцены (дальний зал): как у обычной сцены
const FOG_FAR_END = 64;
const WALL_HOLD = 0.55; // потолок прогресса, пока здание и центральный кадр не загрузились: здание видно лишь слегка сквозь туман
// потолки P по загрузке: после дороги P не пойдёт дальше начала окна фонарей, после фонарей — начала окна колонн,
// после колонн — дальше WALL_HOLD
const CAP_AFTER_ROAD = LANTERNS[0];
const CAP_AFTER_LANTERNS = COLUMNS[0];
const CAP_AFTER_COLUMNS = WALL_HOLD;
const HERO_SETTLE = 1.0; // секунд после загрузки центрального кадра фасада и его рельефа, прежде чем дать туману уйти совсем
const MIN_HOLD = 1.5; // туман не уходит совсем раньше, чем через столько секунд после старта
const MAX_HOLD = 14; // страховка: если загрузка зависла, всё равно рассеиваем
const MIST_COLOR = "#8a91a0"; // цвет дымки (он же цвет фона сцены, пока туман есть)
const NIGHT_COLOR = "#050608"; // финальный цвет тумана и фона
// ═════════════════════════════════════════════════════════════════════════

// Сигналы загрузки от других компонентов (центральный кадр фасада грузится вне этапов; его выставляет FacadeHero)
export const mistSignals = { heroReady: false };

function srgbVec(hex: string) {
  const rgb = { r: 0, g: 0, b: 0 };
  new THREE.Color(hex).getRGB(rgb, THREE.SRGBColorSpace); // цвет пишем в буфер как есть (sRGB), как у фона сцены на экране
  return new THREE.Vector3(rgb.r, rgb.g, rgb.b);
}

// Общие uniform-ы тумана для фонарей и колонн: у них туман вшит в материал, они проступают сами, каждые по своему окну.
// 1 — полностью в дымке, 0 — чёткие. Обычный туман сцены у этих материалов выключен (fog = false), иначе он скрыл бы их до срока.
// Хранятся в globalThis: при горячей перезагрузки модуля (правка настроек) материалы остаются привязаны к тем же объектам, и фонари
// с колоннами не пропадают до ручного обновления страницы.
type MistUniforms = { color: { value: THREE.Vector3 }; lanterns: { value: number }; columns: { value: number } };
const shared = globalThis as unknown as { __mistUniforms?: MistUniforms };
shared.__mistUniforms ??= { color: { value: srgbVec(MIST_COLOR) }, lanterns: { value: 1 }, columns: { value: 1 } };
export const mistUniforms = shared.__mistUniforms;
mistUniforms.color.value.copy(srgbVec(MIST_COLOR)); // цвет подхватывает правки настроек

// Подмешивает дымку в конец шейдера материалов (один раз, до первой компиляции): шейдер потом не меняется, меняется только uniform
export function applyMist(root: THREE.Object3D | null, kind: "lanterns" | "columns") {
  root?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m.userData.mistPatched) continue;
      m.userData.mistPatched = true;
      (m as THREE.MeshStandardMaterial).fog = false;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uMistColor = mistUniforms.color;
        shader.uniforms.uMist = mistUniforms[kind];
        shader.fragmentShader =
          "uniform vec3 uMistColor;\nuniform float uMist;\n" +
          shader.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, uMist);");
      };
      m.customProgramCacheKey = () => "mist";
      m.needsUpdate = true;
    }
  });
}

const MARKS = [0.05, 0.15, 0.3, 0.5, 0.62, 0.8, 0.9];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
// границы тумана меняются геометрически (в разы, а не на метры): в области 12–40 м, где стоит стена фасада, туман редеет медленно
const geo = (a: number, b: number, t: number) => a * Math.pow(b / a, t);
const win = (p: number, w: number[]) => clamp01((p - w[0]) / (w[1] - w[0])); // положение P внутри окна, 0…1

// Начальные значения тумана сцены (для JSX в Scene): густая дымка
export const MIST_FOG_ARGS: [string, number, number] = [MIST_COLOR, FOG_NEAR_START, FOG_FAR_START];
export const MIST_BACKGROUND = MIST_COLOR;

export default function MistLayer({ loaded }: { loaded: number }) {
  const live = useRef({ loaded });
  const done = useRef(false);
  const [, setDone] = useState(false);
  useEffect(() => {
    live.current = { loaded };
  });
  useEffect(() => {
    mistSignals.heroReady = false; // новая загрузка страницы (в том числе после горячей перезагрузки)
  }, []);

  const st = useRef({ t: 0, heroAt: -1, startAt: -1, p: 0, marked: new Set<number>() });
  const night = useRef(new THREE.Color(NIGHT_COLOR));
  const mist = useRef(new THREE.Color(MIST_COLOR));
  const tint = useRef(new THREE.Color());

  useFrame(({ scene }, dt) => {
    if (done.current) return;
    const s = st.current;
    const { loaded: l } = live.current;
    const step = Math.min(dt, 0.1);
    s.t += step;
    if (mistSignals.heroReady && s.heroAt < 0) s.heroAt = s.t;
    // туман начинает редеть чуть позже готовности дороги
    if (s.startAt < 0 && l >= 1) s.startAt = s.t + START_DELAY;
    const ready = (l >= 4 && s.heroAt >= 0 && s.t - s.heroAt >= HERO_SETTLE && s.t >= MIN_HOLD) || s.t >= MAX_HOLD;
    const cap = ready ? 1 : l >= 3 ? CAP_AFTER_COLUMNS : l >= 2 ? CAP_AFTER_LANTERNS : l >= 1 ? CAP_AFTER_ROAD : 0;
    if (s.startAt >= 0 && s.t >= s.startAt) {
      // скорость падает у потолка, чтобы остановка в ожидании загрузки была плавной
      const v = (1 / FOG_SEC) * clamp01((cap - s.p) / 0.06);
      s.p = Math.min(cap, s.p + v * step);
    }
    const p = s.p;
    // метки для проверки темпа в DevTools (Performance): когда туман дошёл до потолков и до конца
    for (const k of MARKS)
      if (p >= k && !s.marked.has(k)) {
        s.marked.add(k);
        performance.mark(`mist:p${k}`);
      }

    const fog = scene.fog as THREE.Fog | null;
    if (p >= 0.9995) {
      done.current = true;
      mistUniforms.lanterns.value = 0;
      mistUniforms.columns.value = 0;
      if (fog) {
        fog.near = FOG_NEAR_END;
        fog.far = FOG_FAR_END;
        fog.color.copy(night.current);
      }
      scene.background = new THREE.Color(NIGHT_COLOR);
      setDone(true);
      return;
    }

    mistUniforms.lanterns.value = 1 - smooth(win(p, LANTERNS));
    mistUniforms.columns.value = 1 - smooth(win(p, COLUMNS));

    // объёмный туман сцены: границы раздвигаются (геометрически), от ближнего к дальнему проступают улица, стена, дверь
    const tRoad = smooth(win(p, ROAD));
    const tWall = Math.pow(smooth(win(p, WALL_FOG)), FOG_CURVE);
    // цвет тумана и фон: пока тумана много, они одного цвета и стыков не видно; к концу темнеют до финального
    tint.current.copy(night.current).lerp(mist.current, 1 - smooth(win(p, [0.75, 1])));
    if (fog) {
      // сначала границы сходятся в полосу вокруг тротуара (дорога), затем полоса уходит вглубь (здание), оба шага геометрически
      fog.near = geo(FOG_NEAR_START, FOG_NEAR_ROAD, tRoad) * Math.pow(FOG_NEAR_END / FOG_NEAR_ROAD, tWall);
      fog.far = geo(FOG_FAR_START, FOG_FAR_ROAD, tRoad) * Math.pow(FOG_FAR_END / FOG_FAR_ROAD, tWall);
      fog.color.copy(tint.current);
    }
    if (scene.background instanceof THREE.Color) scene.background.copy(tint.current);
  });

  return null;
}
