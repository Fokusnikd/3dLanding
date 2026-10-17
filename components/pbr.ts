"use client";

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useKtx2 } from "./ktx2";

// Наборы PBR-текстур из public/textures/<set>/ (Poly Haven, CC0): цвет, нормали, шероховатость, затенение в щелях.
export type PBRSet = "hall_wall" | "hall_floor" | "marble" | "walnut" | "panel";

// Карты набора лежат в KTX2 (сжатые в видеопамяти). Исключение: цвет panel остаётся WebP, потому что useBogOak (StackWall)
// рисует его на canvas, а сжатую текстуру так прочитать нельзя.
const WEBP_DIFF: PBRSet[] = ["panel"];

function usePBRTextures(set: PBRSet): [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture] {
  const webpDiff = WEBP_DIFF.includes(set);
  const dir = `/textures/${set}`;
  const ktx = useKtx2(webpDiff ? [`${dir}/nor.ktx2`, `${dir}/rough.ktx2`, `${dir}/ao.ktx2`] : [`${dir}/diff.ktx2`, `${dir}/nor.ktx2`, `${dir}/rough.ktx2`, `${dir}/ao.ktx2`]);
  const webp = useTexture(webpDiff ? [`${dir}/diff.webp`] : []);
  return webpDiff ? [webp[0], ktx[0], ktx[1], ktx[2]] : [ktx[0], ktx[1], ktx[2], ktx[3]];
}

// Возвращает пропсы для meshStandardMaterial. Размер поверхности w × h метров и размер одной плитки текстуры tile (м)
// задают повтор, поэтому рисунок на любой стене имеет реальный масштаб.
export function usePBR(set: PBRSet, w: number, h: number, tile: number) {
  const [diff, nor, rough, ao] = usePBRTextures(set);

  const maps = useMemo(() => {
    const make = (t: THREE.Texture, srgb: boolean) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(w / tile, h / tile);
      c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    };
    return {
      map: make(diff, true),
      normalMap: make(nor, false),
      roughnessMap: make(rough, false),
      aoMap: make(ao, false),
    };
  }, [diff, nor, rough, ao, w, h, tile]);

  useEffect(
    () => () => {
      Object.values(maps).forEach((t) => t.dispose());
    },
    [maps],
  );

  return maps;
}

// ───────── Общие наборы для брусков: одна текстура на все детали, плитка по UV в реальных метрах ─────────
const shared = new Map<PBRSet, Record<"map" | "normalMap" | "roughnessMap" | "aoMap", THREE.Texture>>();

// Текстуры настроены один раз на набор и разделяются между всеми брусками (постаменты, витрины, панели)
export function useSharedPBR(set: PBRSet) {
  const [diff, nor, rough, ao] = usePBRTextures(set);
  return useMemo(() => {
    let m = shared.get(set);
    if (!m) {
      const make = (t: THREE.Texture, srgb: boolean) => {
        const c = t.clone();
        c.wrapS = c.wrapT = THREE.RepeatWrapping;
        c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        c.anisotropy = 8;
        c.needsUpdate = true;
        return c;
      };
      m = { map: make(diff, true), normalMap: make(nor, false), roughnessMap: make(rough, false), aoMap: make(ao, false) };
      shared.set(set, m);
    }
    return m;
  }, [set, diff, nor, rough, ao]);
}

// Брусок, у которого UV по каждой грани масштабированы по реальным размерам (tile — метров на одну плитку текстуры).
// (ou, ov) сдвигает рисунок, чтобы одинаковые бруски не повторяли друг друга.
export function pbrBox(w: number, h: number, d: number, tile: number, ou = 0, ov = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // порядок граней BoxGeometry: +x, -x, +y, -y, +z, -z, по 4 вершины
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  dims.forEach(([u, v], f) => {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * u) / tile + ou, (uv.getY(k) * v) / tile + ov);
    }
  });
  return g;
}

// Масштаб UV у готовой геометрии (цилиндр и т. п.)
export function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}
