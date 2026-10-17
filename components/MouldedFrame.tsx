"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// Лепной багет из чёрного лакового дерева с бронзовым декором: профиль (внутренняя кромка, выкружка, фриз с жемчужной нитью, валик, ступенчатый наружный карниз),
// пущенный по прямоугольнику со скошенными углами; в углах — розетки, по центрам сторон — картуши.
// Размеры в метрах. d — вынос от края проёма наружу, z — высота от стены к зрителю.
type P = [number, number];

const CHANNEL_W = 0.15; // ширина канала: розетка 0.1 м + по 2.5 см воздуха с каждой стороны
const SIDE_W = 0.096; // ширина одной стороны (валик + карниз)
const FRIEZE_D = SIDE_W + CHANNEL_W / 2; // середина канала с декором
const FRIEZE_Z = 0.05;
const PEARL_R = 0.0085;

// Профиль симметричен относительно канала с декором: по обе стороны одинаковые карниз и валик,
// поэтому розетки и жемчужины стоят строго посередине с равными отступами.

function buildProfile(): P[] {
  // половина профиля от края канала наружу: (вынос o, высота z)
  const half: P[] = [];
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * Math.PI;
    half.push([0.015 - 0.015 * Math.cos(a), FRIEZE_Z + 0.012 * Math.sin(a)]); // выпуклый валик
  }
  for (let k = 1; k <= 8; k++) {
    const t = k / 8;
    half.push([0.03 + 0.052 * t, FRIEZE_Z + 0.026 * (t * t * (3 - 2 * t))]); // S-образный карниз
  }
  half.push([0.089, 0.078], [SIDE_W, 0.074]);

  const pts: P[] = [[0, 0]];
  // внутренняя сторона: та же половина в зеркале, от кромки проёма к каналу
  for (const [o, z] of [...half].reverse()) pts.push([SIDE_W - o, z]);
  pts.push([SIDE_W + CHANNEL_W, FRIEZE_Z]);
  // наружная сторона и спуск к стене
  for (const [o, z] of half) pts.push([SIDE_W + CHANNEL_W + o, z]);
  pts.push([SIDE_W * 2 + CHANNEL_W, 0]);
  return pts;
}

const PROFILE = buildProfile();
export const FRAME_W = PROFILE[PROFILE.length - 1][0]; // ширина багета
const Z_MAX = 0.078;
const DARK = new THREE.Color("#0b0706");
const LIGHT = new THREE.Color("#4a382a");

function buildFrame(w: number, h: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  const segN: P[] = PROFILE.slice(0, -1).map((p, i) => {
    const dd = PROFILE[i + 1][0] - p[0];
    const dz = PROFILE[i + 1][1] - p[1];
    const l = Math.hypot(dd, dz) || 1;
    return [-dz / l, dd / l];
  });
  const cum = [0];
  PROFILE.slice(1).forEach((p, i) =>
    cum.push(cum[i] + Math.hypot(p[0] - PROFILE[i][0], p[1] - PROFILE[i][1])),
  );

  // нормаль в вершине сглаживается только на плавных участках профиля, острые рёбра остаются острыми
  const vertexN = (i: number, end: 0 | 1): P => {
    const n = segN[i];
    const other = end === 0 ? segN[i - 1] : segN[i + 1];
    if (!other || n[0] * other[0] + n[1] * other[1] < Math.cos(0.7)) return n;
    const x = n[0] + other[0];
    const y = n[1] + other[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };

  // четыре стороны: от угла a к углу b, u — направление «наружу»
  const sides = [
    { a: [-1, 1], b: [1, 1], u: [0, 1] },
    { a: [1, 1], b: [1, -1], u: [1, 0] },
    { a: [1, -1], b: [-1, -1], u: [0, -1] },
    { a: [-1, -1], b: [-1, 1], u: [-1, 0] },
  ];
  let base = 0;
  for (const s of sides) {
    const tx = (s.b[0] - s.a[0]) / 2;
    const ty = (s.b[1] - s.a[1]) / 2;
    for (let i = 0; i < PROFILE.length - 1; i++) {
      for (const end of [0, 1] as const) {
        const j = i + end;
        const [d, z] = PROFILE[j];
        const [nd, nz] = vertexN(i, end);
        const shade = Math.pow(Math.min(1, Math.max(0, z / Z_MAX)), 1.3);
        const c = DARK.clone().lerp(LIGHT, 0.12 + 0.88 * shade);
        for (const corner of [s.a, s.b]) {
          const x = corner[0] * (w / 2 + d);
          const y = corner[1] * (h / 2 + d);
          pos.push(x, y, z);
          const nx = s.u[0] * nd;
          const ny = s.u[1] * nd;
          const l = Math.hypot(nx, ny, nz) || 1;
          nor.push(nx / l, ny / l, nz / l);
          uv.push((x * tx + y * ty) / 0.6, cum[j] / 0.6);
          col.push(c.r, c.g, c.b);
        }
      }
      // порядок вершин: A_i, B_i, A_{i+1}, B_{i+1}
      idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
      base += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// потемневшая бронза: приглушённая, без жёлтого блеска
const BRONZE = "#8a7656";
const goldProps = {
  color: BRONZE,
  metalness: 0.9,
  roughness: 0.4,
  envMapIntensity: 1.1,
} as const;

// Жемчужная нить по центру фриза: один InstancedMesh на всю раму
function Pearls({ w, h }: { w: number; h: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    const hw = w / 2 + FRIEZE_D;
    const hh = h / 2 + FRIEZE_D;
    const gap = 0.15; // отступ от угла: там стоят розетки
    const step = 0.04;
    const run = (x1: number, y1: number, x2: number, y2: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.round(len / step));
      for (let k = 0; k <= n; k++)
        out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
    };
    run(-hw + gap, hh, hw - gap, hh);
    run(-hw + gap, -hh, hw - gap, -hh);
    run(-hw, -hh + gap, -hw, hh - gap);
    run(hw, -hh + gap, hw, hh - gap);
    return out;
  }, [w, h]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    spots.forEach(([x, y], i) => {
      o.position.set(x, y, FRIEZE_Z + PEARL_R * 0.7);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh
      key={spots.length}
      ref={ref}
      args={[undefined, undefined, spots.length]}
      castShadow
    >
      <sphereGeometry args={[PEARL_R, 10, 8]} />
      <meshStandardMaterial {...goldProps} roughness={0.3} />
    </instancedMesh>
  );
}

// Угловая розетка: диск, кольцо, восемь лепестков и центральная «пуговица»
function Rosette({ x, y }: { x: number; y: number }) {
  const petals = useMemo(
    () => Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2),
    [],
  );
  return (
    <group position={[x, y, FRIEZE_Z]}>
      <group scale={0.5}>
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0.012]}
          castShadow
        >
          <cylinderGeometry args={[0.097, 0.1, 0.024, 32]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
        <mesh position={[0, 0, 0.026]} castShadow>
          <torusGeometry args={[0.078, 0.009, 10, 40]} />
          <meshStandardMaterial {...goldProps} roughness={0.24} />
        </mesh>
        {petals.map((a) => (
          <mesh
            key={a}
            position={[Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0.03]}
            rotation={[0, 0, a]}
            scale={[1.7, 0.8, 0.55]}
            castShadow
          >
            <sphereGeometry args={[0.02, 12, 10]} />
            <meshStandardMaterial {...goldProps} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.034]} scale={[1, 1, 0.8]} castShadow>
          <sphereGeometry args={[0.03, 16, 12]} />
          <meshStandardMaterial {...goldProps} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

// Картуш по центру стороны: вытянутая «раковина» с ободком и жемчужиной
function Cartouche({
  x,
  y,
  rot,
  long = 0.19,
}: {
  x: number;
  y: number;
  rot: number;
  long?: number;
}) {
  return (
    <group position={[x, y, FRIEZE_Z]} rotation={[0, 0, rot]}>
      <mesh position={[0, 0, 0.008]} scale={[long, 0.032, 0.016]} castShadow>
        <sphereGeometry args={[1, 24, 14]} />
        <meshStandardMaterial {...goldProps} />
      </mesh>
      <mesh
        position={[0, 0, 0.018]}
        scale={[long * 0.72, 0.019, 0.012]}
        castShadow
      >
        <sphereGeometry args={[1, 24, 14]} />
        <meshStandardMaterial {...goldProps} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0, 0.026]} castShadow>
        <sphereGeometry args={[0.013, 16, 12]} />
        <meshStandardMaterial {...goldProps} roughness={0.2} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (long * 1.1), 0, 0.008]}
          scale={[1, 1, 0.7]}
          castShadow
        >
          <sphereGeometry args={[0.012, 14, 10]} />
          <meshStandardMaterial {...goldProps} />
        </mesh>
      ))}
    </group>
  );
}

// w × h — размер проёма (под картину). Рама лежит вокруг него, лицо смотрит в +z.
export default function MouldedFrame({ w, h }: { w: number; h: number }) {
  const geo = useMemo(() => buildFrame(w, h), [w, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  const cx = w / 2 + FRIEZE_D;
  const cy = h / 2 + FRIEZE_D;
  return (
    <group position={[0, 0, -0.005]}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshPhysicalMaterial
          vertexColors
          metalness={0.15}
          roughness={0.42}
          clearcoat={0.8}
          clearcoatRoughness={0.25}
          envMapIntensity={1.2}
        />
      </mesh>
      <Pearls w={w} h={h} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <Rosette key={`${sx}${sy}`} x={sx * cx} y={sy * cy} />
        )),
      )}
      <Cartouche x={0} y={cy} rot={0} long={0.15} />
      <Cartouche x={0} y={-cy} rot={0} long={0.15} />
      <Cartouche x={-cx} y={0} rot={Math.PI / 2} long={0.11} />
      <Cartouche x={cx} y={0} rot={Math.PI / 2} long={0.11} />
    </group>
  );
}
