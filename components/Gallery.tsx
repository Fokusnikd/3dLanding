"use client";

import { useEffect, useMemo } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { RoundedBox, Sparkles, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { MotionValue } from "motion/react";
import {
  DEPTH,
  DOOR_H,
  DOOR_W,
  HALF_W,
  LEFT_BOARD_Z,
  LEFT_SPOT_Z,
  RIGHT_BOARD_Z,
  RIGHT_SPOT_Z,
  ROOM_H as H,
  SK,
  SPOT_K,
  SPOT_OFF,
  SPOT_Y,
  SZ,
} from "@/lib/gallery";
import { statueApi, statueFocus } from "./controls";
import Spot from "./Spot";
import StoneColumn from "./StoneColumn";
import { pbrBox } from "./pbr";
import { getKtx2Loader } from "./ktx2";
import BrassPlate from "./BrassPlate";
import { asset } from "@/lib/asset";

// Палитра «тёмная галерея»: английский зелёный, тёмный орех, латунь
const WALNUT = "#150d08";
const BRASS = "#b8924f";

type V3 = [number, number, number];

function Box({
  pos,
  size,
  color = WALNUT,
  roughness = 0.45,
  metalness = 0,
  cast = true,
}: {
  pos: V3;
  size: V3;
  color?: string;
  roughness?: number;
  metalness?: number;
  cast?: boolean;
}) {
  return (
    <mesh position={pos} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

const Brass = (props: { pos: V3; size: V3 }) => <Box {...props} color={BRASS} metalness={1} roughness={0.32} />;

// ───────── Колонна в углу зала: тот же StoneColumn, что и на фасаде (ствол, база и капитель из одних картинок) ─────────
const COLUMN_D = 0.7; // диаметр ствола, м
// расстояние оси колонны до обеих стен угла. Тело капители уходит назад от оси на d·1.05 (0.735 м), поэтому меньше 0.78 м нельзя:
// иначе абак торчит сквозь стену и карниз.
const COLUMN_SIDE = 0.8;

// Лицо капители у StoneColumn смотрит в +z, тела за ней уходят в −z, то есть в стену. У дальних углов это так и есть,
// у ближних (у входной стены) стена с другой стороны, поэтому колонна развёрнута на 180°.
function Column({ pos, flip }: { pos: V3; flip?: boolean }) {
  return (
    <group position={pos} rotation={[0, flip ? Math.PI : 0, 0]}>
      {/* капитель упирается в низ карниза, а не заходит в него */}
      <StoneColumn d={COLUMN_D} top={H - CORNICE.h} tint="#d6d3cc" glow={0.08} />
    </group>
  );
}

// ───────── Профили стен: плинтус и карниз из картинок (public/facade/kit/hall), бесшовно по длине ─────────
// Картинка — вырезанная полоса профиля; высоту задаём мы, длину одной плитки считаем из пропорций, чтобы профиль не растягивался.
const BASEBOARD = { src: asset("/facade/kit/hall/baseboard.webp"), aspect: 1316 / 261, h: 0.38 };
const CORNICE = { src: asset("/facade/kit/hall/cornice.webp"), aspect: 1536 / 374, h: 0.65 };

function Trim({
  spec,
  y,
  pos,
  rotY,
  length,
}: {
  spec: typeof BASEBOARD;
  y: number;
  pos: [number, number];
  rotY: number;
  length: number;
}) {
  const src = useTexture(spec.src);
  const map = useMemo(() => {
    const t = src.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(length / (spec.h * spec.aspect), 1);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [src, length, spec]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={[pos[0], y, pos[1]]} rotation={[0, rotY, 0]} receiveShadow>
      <planeGeometry args={[length, spec.h]} />
      <meshStandardMaterial map={map} alphaTest={0.5} roughness={0.75} />
    </mesh>
  );
}

// ───────── Архитектура: плинтус, карниз, пилястры, колонны в углах, наличники двери ─────────
function Architecture() {
  const e = 0.02; // отступ от стены, чтобы детали не «мерцали» вместе с её поверхностью
  const bY = BASEBOARD.h / 2;
  const cY = H - CORNICE.h / 2;
  const sideW = HALF_W - DOOR_W / 2 - 0.16; // плинтус входной стены по обе стороны от наличников двери
  return (
    <group>
      {/* плинтус по всем стенам; у входной — по обе стороны от двери */}
      <Trim spec={BASEBOARD} y={bY} pos={[0, -DEPTH + e]} rotY={0} length={HALF_W * 2} />
      <Trim spec={BASEBOARD} y={bY} pos={[-HALF_W + e, -DEPTH / 2]} rotY={Math.PI / 2} length={DEPTH} />
      <Trim spec={BASEBOARD} y={bY} pos={[HALF_W - e, -DEPTH / 2]} rotY={-Math.PI / 2} length={DEPTH} />
      {[-1, 1].map((s) => (
        <Trim key={s} spec={BASEBOARD} y={bY} pos={[s * (HALF_W - sideW / 2), -0.23]} rotY={Math.PI} length={sideW} />
      ))}

      {/* карниз по всем четырём стенам */}
      <Trim spec={CORNICE} y={cY} pos={[0, -DEPTH + e]} rotY={0} length={HALF_W * 2} />
      <Trim spec={CORNICE} y={cY} pos={[-HALF_W + e, -DEPTH / 2]} rotY={Math.PI / 2} length={DEPTH} />
      <Trim spec={CORNICE} y={cY} pos={[HALF_W - e, -DEPTH / 2]} rotY={-Math.PI / 2} length={DEPTH} />
      <Trim spec={CORNICE} y={cY} pos={[0, -0.23]} rotY={Math.PI} length={HALF_W * 2} />

      {/* колонны во всех четырёх углах зала, на стыках стен */}
      {[-1, 1].flatMap((sx) =>
        [-DEPTH + COLUMN_SIDE, -0.2 - COLUMN_SIDE].map((z) => (
          <Column key={`${sx}:${z}`} pos={[sx * (HALF_W - COLUMN_SIDE), 0, z]} flip={z > -DEPTH / 2} />
        )),
      )}

      {/* наличники двери со стороны зала */}
      {[-1, 1].map((s) => (
        <Box key={s} pos={[s * (DOOR_W / 2 + 0.08), (DOOR_H + 0.14) / 2, -0.25]} size={[0.16, DOOR_H + 0.14, 0.08]} />
      ))}
      <Box pos={[0, DOOR_H + 0.09, -0.25]} size={[DOOR_W + 0.48, 0.18, 0.1]} />
      <Brass pos={[0, DOOR_H + 0.005, -0.3]} size={[DOOR_W + 0.16, 0.025, 0.02]} />
      {/* латунный порог */}
      <Brass pos={[0, 0.012, -0.1]} size={[DOOR_W, 0.024, 0.4]} />
    </group>
  );
}

// ───────── Потолочные рельсы и подвесы для прожекторов ─────────
function Tracks() {
  const ty = H - 0.04;
  // координаты совпадают с прожекторами в Room.tsx (оттуда же берутся из lib/gallery.ts)
  const rods: V3[] = [
    [-3.6 * SK, 0, -DEPTH + SPOT_OFF],
    [0, 0, -DEPTH + SPOT_OFF],
    [3.6 * SK, 0, -DEPTH + SPOT_OFF],
    ...LEFT_SPOT_Z.map((z): V3 => [-HALF_W + SPOT_OFF, 0, z]),
    ...RIGHT_SPOT_Z.map((z): V3 => [HALF_W - SPOT_OFF, 0, z]),
  ];
  const railLen = 10.8 * SZ;
  return (
    <group>
      <Box pos={[0, ty, -DEPTH + SPOT_OFF]} size={[HALF_W * 1.7, 0.05, 0.07]} color="#0b0b0b" roughness={0.4} metalness={0.5} />
      <Box pos={[-HALF_W + SPOT_OFF, ty, LEFT_BOARD_Z]} size={[0.07, 0.05, railLen]} color="#0b0b0b" roughness={0.4} metalness={0.5} />
      <Box pos={[HALF_W - SPOT_OFF, ty, LEFT_BOARD_Z]} size={[0.07, 0.05, railLen]} color="#0b0b0b" roughness={0.4} metalness={0.5} />
      {rods.map(([x, , z]) => (
        <Box key={`${x}:${z}`} pos={[x, (H + SPOT_Y) / 2 - 0.02, z]} size={[0.02, H - SPOT_Y, 0.02]} color="#0b0b0b" cast={false} />
      ))}
    </group>
  );
}

// ───────── Скамья в центре зала ─────────
function Bench() {
  return (
    <group position={[0, 0, -7.6 * SZ]} scale={SK}>
      <RoundedBox args={[2.4, 0.14, 0.62]} radius={0.05} smoothness={3} position={[0, 0.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#3a1c16" roughness={0.5} />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <Brass key={s} pos={[s * 1.0, 0.215, 0]} size={[0.05, 0.43, 0.5]} />
      ))}
      <Brass pos={[0, 0.13, 0]} size={[2.0, 0.035, 0.035]} />
    </group>
  );
}

// ───────── Статуи ваших увлечений: стоят на постаментах в разных частях зала ─────────
type Hobby = "fencing" | "games" | "climbing" | "boardgames";

// Статуи: public/models/statue_<kind>.glb. Настоящие 3D-модели: сгенерированы по листам нейросетью Pixal3D + TRELLIS.2 в ComfyUI,
// затем доведены в Blender (масштаб в метрах, упрощение сетки, текстуры 2048). Начало координат — центр основания,
// лицо (с этой стороны смотрели листы) направлено в +z модели.
// Модели грузятся только когда Room доходит до третьего этапа (без preload на уровне модуля).
function Statue({ kind }: { kind: Hobby }) {
  const gl = useThree((s) => s.gl);
  // Текстуры статуй в KTX2 (KHR_texture_basisu): GLTFLoader нужен общий KTX2Loader.
  const { scene } = useGLTF(asset(`/models/statue_${kind}.glb`), true, true, (loader) => {
    // GLTFLoader в drei из three-stdlib: его тип KTX2Loader отличается от three/examples лишь сигнатурой dispose()
    loader.setKTX2Loader(getKtx2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      // фото уже содержит свет и тень: слабое самосвечение, чтобы мрамор читался в тёмной витрине
      mat.emissive = new THREE.Color("#ffffff");
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = 0.12;
      m.material = mat;
      m.castShadow = true;
      m.receiveShadow = true;
    });
    return root;
  }, [scene]);
  return <primitive object={model} />;
}

// Статуи на белых мраморных постаментах разной высоты (как в классическом музее), лицом в зал перпендикулярно стене.
// Места: центр левой стены, правая стена между двумя досками, у входной стены слева от двери.
// sc — во сколько раз увеличена модель (запечена 1.2 / 1.3 / 1.7 м), h — итоговая высота статуи, м;
// ped — постамент: ширина, глубина (по направлению «лица»), высота. Отступ от стены ~0.25 м.
const STAND_WALL_GAP = 0.25;
const STANDS: {
  kind: Hobby;
  x: number;
  z: number;
  yaw: number;
  sc: number;
  h: number;
  ped: [number, number, number];
}[] = [
  // основания моделей (после масштаба): games 1.2 × 2.4, fencing 1.8 × 1.5, climbing 1.35 × 1.35 м; постамент чуть больше
  {
    kind: "games",
    x: -HALF_W + STAND_WALL_GAP + 2.6 / 2,
    z: LEFT_BOARD_Z, // на оси доски «Услуги»: камера смотрит ровно на неё
    yaw: Math.PI / 2,
    sc: 1.83,
    h: 2.2,
    ped: [1.5, 2.6, 0.9],
  },
  {
    kind: "fencing",
    x: HALF_W - STAND_WALL_GAP - 1.75 / 2,
    z: (RIGHT_BOARD_Z[0] + RIGHT_BOARD_Z[1]) / 2,
    yaw: -Math.PI / 2,
    sc: 1.615,
    h: 2.1,
    ped: [2.1, 1.75, 1.0],
  },
  {
    kind: "climbing",
    x: -4.0,
    z: -(0.2 + STAND_WALL_GAP + 1.6 / 2),
    yaw: Math.PI,
    sc: 1.53,
    h: 2.6,
    ped: [1.6, 1.6, 0.8],
  },
  // основание модели 1.19 × 1.76 м (после масштаба 1.6); у входной стены по другую сторону двери от скалолаза
  {
    kind: "boardgames",
    x: 4.0,
    z: -(0.2 + STAND_WALL_GAP + 2.1 / 2),
    yaw: Math.PI,
    sc: 1.6,
    h: 2.1,
    ped: [1.5, 2.1, 0.9],
  },
];

// ───────── Мрамор постаментов: жилки рисуем на canvas, плитка 1.5 м ─────────
const MARBLE_TILE = 1.5;
let marbleTex: THREE.CanvasTexture | null = null;

function getMarble() {
  if (marbleTex) return marbleTex;
  const s = 1024;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, s, s);
  bg.addColorStop(0, "#e6e1d6");
  bg.addColorStop(0.5, "#d8d2c5");
  bg.addColorStop(1, "#e2ddd1");
  g.fillStyle = bg;
  g.fillRect(0, 0, s, s);
  // облачные пятна
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = 40 + Math.random() * 140;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < 0.5;
    gr.addColorStop(0, dark ? "rgba(150,142,130,0.10)" : "rgba(255,255,255,0.14)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // жилки: ломаные с плавным дрейфом, тонкие и толстые, с обёрткой по краям для бесшовности
  g.lineCap = "round";
  for (let v = 0; v < 14; v++) {
    const thick = v < 4;
    const x = Math.random() * s;
    const y = Math.random() * s;
    const ang = Math.random() * Math.PI * 2;
    g.strokeStyle = thick ? "rgba(92,86,80,0.32)" : "rgba(110,104,96,0.2)";
    g.lineWidth = thick ? 2.4 : 0.9;
    for (const off of [[0, 0], [-s, 0], [s, 0], [0, -s], [0, s]]) {
      let px = x + off[0];
      let py = y + off[1];
      let a = ang;
      g.beginPath();
      g.moveTo(px, py);
      for (let k = 0; k < 60; k++) {
        a += (Math.sin(k * 0.7 + v) * 0.5 + (Math.random() - 0.5)) * 0.5;
        px += Math.cos(a) * 16;
        py += Math.sin(a) * 16;
        g.lineTo(px, py);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  marbleTex = t;
  return t;
}

// Брусок с мраморной текстурой: UV по граням масштабируем по реальным размерам, чтобы рисунок не растягивался
function MarbleBox({ pos, size }: { pos: V3; size: V3 }) {
  const map = useMemo(() => getMarble(), []);
  const [w, h, d] = size;
  const geo = useMemo(() => pbrBox(w, h, d, MARBLE_TILE), [w, h, d]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh position={pos} geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial map={map} roughness={0.38} metalness={0.02} envMapIntensity={0.9} />
    </mesh>
  );
}

const LABELS: Record<Hobby, { title: string; sub: string }> = {
  games: { title: "Обожаю погружаться в видео игры", sub: "" },
  fencing: { title: "Увлечённо занимаюсь фехтованием", sub: "" },
  climbing: { title: "Люблю покорять скалы и новые высоты", sub: "" },
  boardgames: { title: "Очень люблю играть в настольные игры", sub: "" },
};

// Постамент: цоколь, ствол и верхняя плита из мрамора, на лицевой стороне — табличка
function Pedestal({ w, d, h, kind }: { w: number; d: number; h: number; kind: Hobby }) {
  const { title, sub } = LABELS[kind];
  return (
    <group>
      <MarbleBox pos={[0, 0.07, 0]} size={[w + 0.18, 0.14, d + 0.18]} />
      <MarbleBox pos={[0, h / 2, 0]} size={[w, h - 0.26, d]} />
      <MarbleBox pos={[0, h - 0.07, 0]} size={[w + 0.14, 0.14, d + 0.14]} />
      <BrassPlate title={title} sub={sub} pos={[0, h * 0.42, d / 2]} w={1.0} h={0.4} />
    </group>
  );
}

function StatueStand({ stand }: { stand: (typeof STANDS)[number] }) {
  const { kind, x, z, yaw, sc, h, ped } = stand;
  const [pw, pd, ph] = ped;
  // прожектор над статуей со стороны зала (по направлению «лица»), штанга уходит к потолку
  const sx = x + Math.sin(yaw) * 2.4;
  const sz = z + Math.cos(yaw) * 2.4;
  // Клик: камера встаёт перед статуей на уровне её середины, лицом к ней (yaw камеры совпадает с yaw статуи),
  // на таком расстоянии, чтобы статуя с запасом входила в кадр по высоте.
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // это было перетаскивание (облёт камеры), а не клик
    const dist = pd / 2 + Math.max(h * 1.8, 3.4);
    statueApi.open({
      id: kind,
      x: x + Math.sin(yaw) * dist,
      y: ph + h * 0.45,
      z: z + Math.cos(yaw) * dist,
      yaw,
      tx: x,
      tz: z,
    });
  };
  return (
    <group>
      <group
        position={[x, 0, z]}
        rotation={[0, yaw, 0]}
        onClick={open}
        onPointerOver={(e) => {
          e.stopPropagation();
          // когда статуя приближена, курсор задаёт CSS (рука для перетаскивания)
          if (statueFocus.get() < 0.5) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <Pedestal w={pw} d={pd} h={ph} kind={kind} />
        <group position={[0, ph, 0]} scale={sc}>
          <Statue kind={kind} />
        </group>
      </group>
      <Box pos={[sx, (H + SPOT_Y) / 2 - 0.02, sz]} size={[0.02, H - SPOT_Y, 0.02]} color="#0b0b0b" cast={false} />
      <Spot pos={[sx, SPOT_Y, sz]} aim={[x, ph + h * 0.55, z]} intensity={110 * SPOT_K} angle={0.4} shadow />
    </group>
  );
}

// Статуи с постаментами: третий этап загрузки
export const STATUE_COUNT = STANDS.length; // у каждой свой теневой прожектор (см. заглушки света в Room)
export function Statues() {
  return (
    <group>
      {STANDS.map((s) => (
        <StatueStand key={s.kind} stand={s} />
      ))}
    </group>
  );
}

// Каркас зала: архитектура, рельсы, скамья, пылинки
export default function Gallery(_props: { progress: MotionValue<number> }) {
  return (
    <group>
      <Architecture />
      <Tracks />
      <Bench />
      {/* мягкая подсветка скамьи по центру зала */}
      <Spot pos={[0, SPOT_Y, -7.6 * SZ + 1.2]} aim={[0, 0.5 * SK, -7.6 * SZ]} intensity={30 * SPOT_K} angle={0.5} fixture={false} />

      {/* пылинки в лучах света */}
      <Sparkles count={150} scale={[HALF_W * 1.8, H * 0.86, DEPTH * 0.93]} position={[0, H * 0.48, -DEPTH / 2]} size={2} speed={0.12} opacity={0.4} color="#ffe2b0" noise={0.5} />
    </group>
  );
}
