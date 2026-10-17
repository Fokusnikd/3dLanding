import * as THREE from "three";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

// Ждёт «спокойного» момента, чтобы фоновая подгрузка не мешала: минимальная пауза, затем несколько подряд лёгких кадров.
// Если вкладка в фоне (rAF стоит) или кадры всё время тяжёлые, всё равно стартует через maxWait.
export function idleGate(minDelay = 300, maxWait = 4000): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = 0;
    let calm = 0;
    const done = () => resolve();
    const timer = window.setTimeout(done, maxWait);
    const tick = (now: number) => {
      if (last) calm = now - last < 24 ? calm + 1 : 0;
      last = now;
      if (performance.now() - t0 >= minDelay && calm >= 3) {
        window.clearTimeout(timer);
        done();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const TEX_KEYS = ["map", "normalMap", "aoMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "bumpMap", "displacementMap", "lightMap"] as const;

function collectTextures(root: THREE.Object3D): THREE.Texture[] {
  const set = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      for (const k of TEX_KEYS) {
        const t = (mat as unknown as Record<string, THREE.Texture | null | undefined>)[k];
        if (t && t.isTexture) set.add(t);
      }
    }
  });
  return [...set];
}

let probeTarget: THREE.WebGLRenderTarget | null = null;

// Ждёт, пока драйвер доделает все созданные программы (без блокировки: опрос статуса через расширение параллельной компиляции).
async function programsReady(gl: THREE.WebGLRenderer, cancelled: () => boolean, maxWait = 15000) {
  const t0 = performance.now();
  while (!cancelled() && performance.now() - t0 < maxWait) {
    const programs = (gl.info.programs ?? []) as unknown as { isReady?: () => boolean }[];
    if (programs.every((p) => !p.isReady || p.isReady())) return;
    await new Promise((r) => setTimeout(r, 16));
  }
}

// Готовит скрытый этап к показу без блокировки потока: шейдеры собираются параллельно, текстуры уходят в видеокарту порциями
// по несколько миллисекунд на кадр. Когда этап станет видимым, первый кадр уже не будет ничего компилировать и грузить.
// Шейдеры нужны в двух вариантах: для экрана и для отдельной цели рендера (отражение пола MeshReflectorMaterial рисует всю
// сцену в неё каждый кадр; у цели другой цветовой режим, поэтому программы другие). Без второго варианта эти шейдеры
// собирались бы синхронно уже в кадре отражения (по ~100 мс на материал).
// Работает только при renderer.debug.checkShaderErrors = false (см. Scene): иначе three читает лог шейдера и ждёт драйвер.
export async function warmUp(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, group: THREE.Object3D, cancelled: () => boolean) {
  try {
    await gl.compileAsync(group, camera, scene);
    // вариант для цели рендера: программы создаются синхронно под временной целью, цель возвращаем сразу (до первого await,
    // иначе основной цикл начнёт рисовать в неё), затем ждём готовности программ
    probeTarget ??= new THREE.WebGLRenderTarget(1, 1);
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(probeTarget);
    try {
      gl.compile(scene, camera);
    } finally {
      gl.setRenderTarget(prev);
    }
    await programsReady(gl, cancelled);
  } catch (e) {
    console.warn("[stages] прогрев шейдеров не удался, они соберутся при первом показе", e);
  }
  let t0 = performance.now();
  for (const t of collectTextures(group)) {
    if (cancelled()) return;
    gl.initTexture(t);
    if (performance.now() - t0 > 5) {
      await nextFrame();
      t0 = performance.now();
    }
  }
}

// Подпись набора видимого света: по ней проверяем, что этапы не меняют число и тип источников (иначе three пересоберёт все шейдеры)
export function lightSignature(scene: THREE.Scene): string {
  const sig: string[] = [];
  scene.traverseVisible((o) => {
    const l = o as THREE.Light;
    if (l.isLight) sig.push(`${l.type}${l.castShadow ? "+shadow" : ""}`);
  });
  return sig.sort().join(",");
}
