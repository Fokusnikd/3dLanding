"use client";

// Режим измерения: откройте сайт с ?debug (например http://localhost:3000/?debug) — слева сверху появится панель:
// FPS и время кадра, число вызовов отрисовки и треугольников (renderer.info, включая проход теней), геометрии и текстуры,
// оценка видеопамяти под текстуры, объём и число загруженных файлов (модели, текстуры), время до первого кадра сцены.
// Последние значения доступны в window.__stats (для скриптов и ручных замеров). Без ?debug компонент ничего не рисует и не считает.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { liveStats } from "./liveStats";

type Stats = Record<string, number | string>;
declare global {
  interface Window {
    __stats?: Stats;
    __three?: { gl: THREE.WebGLRenderer; scene: THREE.Scene };
  }
}

const TEX_KEYS = ["map", "normalMap", "aoMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "bumpMap", "displacementMap", "lightMap"] as const;

function texturesVramMb(scene: THREE.Scene) {
  const seen = new Set<string>();
  let bytes = 0;
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      for (const k of TEX_KEYS) {
        const t = (mat as unknown as Record<string, THREE.Texture | null | undefined>)[k];
        if (!t || seen.has(t.uuid)) continue;
        seen.add(t.uuid);
        // KTX2 (CompressedTexture) остаётся в видеопамяти сжатым: считаем реальный размер данных мипов
        const mips = (t as THREE.CompressedTexture).mipmaps as { data?: ArrayBufferView }[] | undefined;
        if ((t as THREE.CompressedTexture).isCompressedTexture && mips?.length) {
          bytes += mips.reduce((a, mip) => a + (mip.data?.byteLength ?? 0), 0);
          continue;
        }
        const img = t.image as { width?: number; height?: number } | undefined;
        if (img?.width && img?.height) bytes += img.width * img.height * 4 * (t.generateMipmaps ? 1.333 : 1);
      }
    }
  });
  return { mb: bytes / 1048576, count: seen.size };
}

function transferred() {
  const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  let bytes = 0;
  let files = 0;
  for (const r of res) {
    if (!/\.(glb|gltf|webp|png|jpe?g|ktx2|hdr|woff2?)(\?|$)/i.test(r.name)) continue;
    bytes += r.transferSize || r.encodedBodySize || 0;
    files++;
  }
  return { mb: bytes / 1048576, files };
}

export default function DebugStats() {
  const debug = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).has("debug"),
    () => false,
  );
  // замеры нужны ещё и экрану «Электрощиток» (components/StatsPage): пока он открыт, считаем их и без ?debug
  const wanted = useSyncExternalStore(liveStats.subscribe, liveStats.isWanted, () => false);
  const on = debug || wanted;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const frames = useRef<number[]>([]);
  const first = useRef<number | null>(null);

  useEffect(() => {
    if (!on) return;
    // для ручных замеров из консоли (обход сцены, включение/выключение групп): только по ?debug
    if (debug) window.__three = { gl, scene };
    // панель на экране — только по ?debug
    const box = debug ? document.createElement("div") : null;
    if (box) {
      box.style.cssText = "position:fixed;left:8px;top:8px;z-index:99999;padding:8px 10px;border-radius:6px;background:rgba(0,0,0,.72);color:#9fe;font:11px/1.45 ui-monospace,Consolas,monospace;white-space:pre;pointer-events:none";
      document.body.appendChild(box);
    }
    let vram = { mb: 0, count: 0 };
    let tick = 0;
    const id = window.setInterval(() => {
      const f = frames.current.splice(0);
      if (f.length === 0) return;
      const avg = f.reduce((a, b) => a + b, 0) / f.length;
      const sorted = [...f].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      if (tick++ % 4 === 0) vram = texturesVramMb(scene);
      const info = gl.info;
      const net = transferred();
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const stats: Stats = {
        fps: +(1000 / avg).toFixed(1),
        frameMsAvg: +avg.toFixed(1),
        frameMsP95: +p95.toFixed(1),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        textureVramMb: +vram.mb.toFixed(0),
        textureCount: vram.count,
        loadedMb: +net.mb.toFixed(1),
        loadedFiles: net.files,
        firstFrameMs: first.current === null ? 0 : Math.round(first.current),
        jsHeapMb: heap ? +(heap.usedJSHeapSize / 1048576).toFixed(0) : 0,
        dpr: +gl.getPixelRatio().toFixed(2),
      };
      window.__stats = stats;
      liveStats.publish(stats);
      if (box) box.textContent =
        `FPS ${stats.fps}  кадр ${stats.frameMsAvg} мс (p95 ${stats.frameMsP95})\n` +
        `вызовов ${stats.drawCalls}  треугольников ${Number(stats.triangles).toLocaleString("ru")}\n` +
        `геометрий ${stats.geometries}  текстур ${stats.textures}  шейдеров ${stats.programs}\n` +
        `видеопамять текстур ~${stats.textureVramMb} МБ (${stats.textureCount} шт.)\n` +
        `загружено ${stats.loadedMb} МБ, файлов ${stats.loadedFiles}\n` +
        `до первого кадра ${stats.firstFrameMs} мс  heap ${stats.jsHeapMb} МБ  dpr ${stats.dpr}`;
    }, 500);
    return () => {
      window.clearInterval(id);
      box?.remove();
    };
  }, [on, debug, gl, scene]);

  useFrame((_, dt) => {
    if (!on) return;
    if (first.current === null) first.current = performance.now();
    frames.current.push(dt * 1000);
  });

  return null;
}
