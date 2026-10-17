"use client";

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// Каменная колонна на фасад и в зал. Картинки из Figma (public/facade/kit/columns/) дают камень и тени,
// а форма настоящая: рифлёный ствол с желобками в геометрии, база — тело вращения по контуру картинки с плинтусом-блоком,
// капитель — плоскость завитков спереди и объёмные тела за ней. Всё масштабируется по диаметру ствола d.
// Начало координат — ось колонны на земле; «лицо» (плоскость завитков) смотрит в +z, тела капители уходят в −z.

// Размеры картинок (px): по толщине ствола на базе (749) и на капители (555) они подгоняются к диаметру d
const BASE_PX = { w: 1206, h: 603, shaft: 749 };
const CAP_PX = { w: 1234, h: 446, shaft: 555 };
const ABACUS_PX = { w: 1114, h: 95 }; // плита-абака капители
// У базы и капители срезаны их собственные рифлёные «хвосты» (база от строки 316, капитель до строки 446 исходных картинок):
// ствол приставлен прямо к тору базы и к шейке капители, поэтому между разными рифлениями нет стыка.
// Шаг рифления подогнан к базе: у пенька базы ≈ 20 желобков по кругу, у картинки ствола 12 желобков на всю ширину.
// Одна обёртка дала бы 12 по кругу, две дают 24. Плитка остаётся квадратной.
const WRAPS = 2;
const FLUTES = 12 * WRAPS;
const RIDGE_PHASE = 0.89; // где в периоде рифления стоит ребро между желобками (по яркости картинки ствола)
const RIDGE_W = 0.07; // ширина ребра в долях периода
const FLUTE_DEPTH = 0.0244; // глубина желобка в долях диаметра
// Контур тора базы: [строка картинки, половина ширины в px]; ниже строки PLINTH_ROW идёт плинтус-блок
const BASE_ROWS: [number, number][] = [
  [0, 378], [6, 379], [12, 382], [18, 388], [24, 400], [30, 411], [36, 412], [42, 412], [48, 414], [54, 435], [60, 444],
  [66, 450], [72, 456], [78, 460], [84, 462], [90, 464], [96, 466], [102, 466], [108, 466], [114, 464], [120, 462],
  [126, 460], [132, 456], [138, 450], [144, 444], [150, 433], [156, 440], [162, 440], [168, 440], [174, 434], [180, 426],
  [186, 423], [192, 422], [198, 422], [204, 422], [210, 423], [216, 426], [222, 430], [228, 436], [234, 443], [240, 454],
  [246, 476], [252, 478], [258, 478], [264, 478], [270, 498], [276, 510], [282, 519], [288, 526], [294, 532], [300, 536],
  [306, 540], [312, 542], [318, 546], [324, 547], [330, 548], [336, 550], [342, 550], [348, 550], [354, 550], [360, 550],
  [366, 548], [372, 546], [378, 544], [384, 542], [390, 538], [396, 547],
];
const PLINTH_ROW = 396;

function dims(d: number, top: number) {
  const kB = d / BASE_PX.shaft; // метров на пиксель картинки базы
  const kC = d / CAP_PX.shaft; // и картинки капители
  const base = { w: BASE_PX.w * kB, h: BASE_PX.h * kB };
  const cap = { w: CAP_PX.w * kC, h: CAP_PX.h * kC };
  const abacus = { w: ABACUS_PX.w * kC, h: ABACUS_PX.h * kC };
  // Ствол стыкуется с базой и капителью встык (с запасом ~1% диаметра от щели)
  const shaftY0 = base.h - d * 0.012;
  const shaftY1 = top - cap.h + d * 0.012;
  return { kB, base, cap, abacus, shaftY0, shaftH: shaftY1 - shaftY0 };
}

// Одна настроенная копия текстуры на всех: колонны на фасаде и в зале раньше клонировали картинки каждая себе,
// и на GPU лежало по копии на колонну. Повтор по высоте ствола делается в UV геометрии, поэтому текстура от размеров не зависит.
const stoneCache = new Map<string, THREE.Texture>();

function useStoneTexture(url: string, wrapX?: number) {
  const tex = useTexture(url);
  return useMemo(() => {
    const key = `${url}|${wrapX ?? 0}`;
    let c = stoneCache.get(key);
    if (!c) {
      c = tex.clone();
      c.colorSpace = THREE.SRGBColorSpace;
      c.anisotropy = 16;
      if (wrapX !== undefined) {
        c.wrapS = c.wrapT = THREE.RepeatWrapping;
        c.repeat.set(wrapX, 1);
      }
      c.needsUpdate = true;
      stoneCache.set(key, c);
    }
    return c;
  }, [tex, url, wrapX]);
}

// Плоская проекция картинки спереди на геометрию: так лицо выглядит ровно как на картинке, а у боков — тот же камень.
// Геометрия уже в координатах колонны (y от земли), w, h и y0 — размер картинки и высота её низа.
function planarUV(g: THREE.BufferGeometry, w: number, h: number, y0: number) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const sideways = n && Math.abs(n.getX(i)) > Math.abs(n.getZ(i)) + 0.01; // боковые грани: рисунок вдоль z, а не растянутый по x
    const u = (sideways ? p.getZ(i) : p.getX(i)) / w + 0.5;
    // верхние грани блоков: берём камень чуть ниже кромки, а не граничную строку картинки (она тёмная)
    const topFace = n && n.getY(i) > 0.9;
    uv.setXY(i, u, (p.getY(i) - y0) / h - (topFace ? 0.08 : 0));
  }
  uv.needsUpdate = true;
  return g;
}

type Props = {
  d: number; // диаметр ствола, м
  top: number; // высота верха капители, м
  tint?: string; // оттенок камня (умножается на картинку)
  glow?: number; // самосвечение картинок: насколько они «не зависят» от света сцены
};

export default function StoneColumn({ d, top, tint = "#ffffff", glow = 0.1 }: Props) {
  const m = useMemo(() => dims(d, top), [d, top]);
  const ry = m.shaftH / ((Math.PI * d) / WRAPS);
  const shaftTex = useStoneTexture("/facade/kit/columns/column_shaft.webp", WRAPS);
  const baseTex = useStoneTexture("/facade/kit/columns/column_base.webp");
  const capTex = useStoneTexture("/facade/kit/columns/column_capital.webp");

  const geo = useMemo(() => {
    const r = d / 2;
    const { kB, base, cap, abacus, shaftY0, shaftH } = m;

    // ствол: цилиндр с настоящими желобками (радиус проседает между рёбрами, форма как у картинки ствола)
    const shaft = new THREE.CylinderGeometry(r * 0.95, r, shaftH, FLUTES * 16, 1, true);
    const sp = shaft.attributes.position;
    const su = shaft.attributes.uv;
    for (let i = 0; i < sp.count; i++) {
      const e = ((((FLUTES * su.getX(i) - RIDGE_PHASE) % 1) + 1.5) % 1) - 0.5; // расстояние до ребра, доля периода
      const a = Math.abs(e);
      const q = a <= RIDGE_W / 2 ? 0 : (a - RIDGE_W / 2) / (0.5 - RIDGE_W / 2);
      const depth = (d * FLUTE_DEPTH * (1 - Math.cos(Math.PI * q))) / 2;
      const x = sp.getX(i);
      const z = sp.getZ(i);
      const rr = Math.hypot(x, z);
      sp.setX(i, (x * (rr - depth)) / rr);
      sp.setZ(i, (z * (rr - depth)) / rr);
      su.setY(i, su.getY(i) * ry); // повтор текстуры по высоте ствола
    }
    su.needsUpdate = true;
    shaft.computeVertexNormals();
    shaft.translate(0, shaftY0 + shaftH / 2, 0);

    // база: торы — тело вращения по контуру картинки, ниже — квадратный плинтус
    const pts = BASE_ROWS.map(([row, hw]) => new THREE.Vector2(hw * kB, (BASE_PX.h - row) * kB)).reverse();
    const tori = planarUV(new THREE.LatheGeometry(pts, 96), base.w, base.h, 0);
    const plinthH = (BASE_PX.h - PLINTH_ROW) * kB;
    const plinth = planarUV(new THREE.BoxGeometry(1203 * kB, plinthH, 1203 * kB).translate(0, plinthH / 2, 0), base.w, base.h, 0);

    // капитель: абака-блок и половина «чаши» за плоскостью завитков, чтобы у неё была глубина
    const capY0 = top - cap.h;
    const abacusG = planarUV(
      new THREE.BoxGeometry(abacus.w, abacus.h, d * 1.05).translate(0, top - abacus.h / 2, (-d * 1.05) / 2),
      cap.w, cap.h, capY0,
    );
    const bowlH = cap.h - abacus.h;
    const bowl = planarUV(
      new THREE.CylinderGeometry(r * 1.15, r * 1.02, bowlH, 48, 1, true, Math.PI / 2, Math.PI).translate(0, capY0 + bowlH / 2, 0),
      cap.w, cap.h, capY0,
    );
    return { shaft, tori, plinth, abacus: abacusG, bowl };
  }, [m, d, top, ry]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  // Картинки уже содержат свет: самосвечение небольшое, чтобы не «заливать» объём светом сцены
  const stone = (tex: THREE.Texture, side?: THREE.Side) => (
    <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={glow} color={tint} roughness={0.9} side={side} />
  );
  return (
    <group>
      <mesh geometry={geo.shaft} receiveShadow>
        {stone(shaftTex)}
      </mesh>
      <mesh geometry={geo.tori} receiveShadow>
        {stone(baseTex)}
      </mesh>
      <mesh geometry={geo.plinth} receiveShadow>
        {stone(baseTex)}
      </mesh>
      {/* завитки капители: плоскость на оси, прозрачная вокруг; за ней объёмные тела */}
      <mesh position={[0, top - m.cap.h / 2, 0]}>
        <planeGeometry args={[m.cap.w, m.cap.h]} />
        <meshStandardMaterial map={capTex} emissiveMap={capTex} emissive="#ffffff" emissiveIntensity={glow} color={tint} roughness={0.9} alphaTest={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.abacus}>{stone(capTex)}</mesh>
      <mesh geometry={geo.bowl}>{stone(capTex, THREE.DoubleSide)}</mesh>
    </group>
  );
}
