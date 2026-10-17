"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, useTexture } from "@react-three/drei";
import { useMotionValueEvent } from "motion/react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PANEL } from "@/lib/gallery";
import { panelDoor } from "./controls";
import { pbrBox } from "./pbr";
import PanelScreen from "./PanelScreen";

// Электрощиток на стене: стальной шкаф с дверцей на левых петлях. Клик подлетает к нему камерой и распахивает дверцу
// (panelDoor 0 → 1, им управляет Scene): внутри на дисплее рисуется статистика ассетов и оптимизации (PanelScreen).
// Текстуры — public/textures/breaker_box (готовит scripts/optimize-panel.mjs из картинок ChatGPT, см. orders/electric-panel-chatgpt.md).
// Лицо смотрит в +z группы, поэтому группу разворачивают к залу.
const DIR = "/textures/breaker_box";
const OPEN_ANGLE = 2.0; // рад: насколько распахивается дверца (~115°)
const TILE = 0.5; // метров стали и цинка на одну плитку текстуры
const INNER = "#1c201d";
const GLOW = 0.3; // собственное свечение стали: щиток висит на тёмной стене и иначе тонет

const URLS = {
  steel: `${DIR}/steel_albedo.webp`,
  steelN: `${DIR}/steel_normal.webp`,
  zinc: `${DIR}/zinc_albedo.webp`,
  zincN: `${DIR}/zinc_normal.webp`,
  brass: `${DIR}/brass_albedo.webp`,
  black: `${DIR}/black_albedo.webp`,
  schematic: `${DIR}/schematic.webp`,
  din: `${DIR}/din_rail.webp`,
  triangle: `${DIR}/decal_triangle.webp`,
  nameplate: `${DIR}/decal_nameplate.webp`,
  highvoltage: `${DIR}/decal_highvoltage.webp`,
  earth: `${DIR}/decal_earth.webp`,
  atlas: `${DIR}/breaker_atlas.webp`,
} as const;
type Key = keyof typeof URLS;
const NORMALS: Key[] = ["steelN", "zincN"];
const TILING: Key[] = ["steel", "steelN", "zinc", "zincN", "brass", "black", "din"];

// Лицевые панели автоматов лежат одним атласом (breaker_atlas.webp): колонки пропорциональны ширинам модулей 1:1:1:2:1:2.
// u — ширина модуля в долях самого узкого, c — цвет корпуса (бежевый или чёрный)
const FACES = [
  { u: 1, c: "#d9d4c4" },
  { u: 1, c: "#d9d4c4" },
  { u: 1, c: "#2b2f2c" },
  { u: 2, c: "#d9d4c4" },
  { u: 1, c: "#d9d4c4" },
  { u: 2, c: "#2b2f2c" },
];
const FACE_UNITS = FACES.reduce((a, f) => a + f.u, 0); // 8 колонок атласа
const MODULE_H = 0.11;
const UNIT = MODULE_H * (183 / 777); // ширина узкого модуля с реальными пропорциями (18 × 90 мм), м
const REPEATS = 4; // сколько раз повторяется набор из шести модулей
const GAP = 0.002;

// Настраиваем копии текстур (кэш drei общий): цвет в sRGB, нормали линейные, материалы повторяются
function usePanelTextures() {
  const raw = useTexture(URLS) as Record<Key, THREE.Texture>;
  const tex = useMemo(() => {
    const out = {} as Record<Key, THREE.Texture>;
    for (const k of Object.keys(URLS) as Key[]) {
      const t = raw[k].clone();
      t.colorSpace = NORMALS.includes(k) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      if (TILING.includes(k)) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.needsUpdate = true;
      out[k] = t;
    }
    return out;
  }, [raw]);
  useEffect(
    () => () => {
      Object.values(tex).forEach((t) => t.dispose());
    },
    [tex],
  );
  return tex;
}

const DOOR_W = PANEL.w - 0.06;
const DOOR_H = PANEL.h - 0.06;

// Лицевая сторона дверцы рисуется на canvas: крашеная сталь, поверх неё наклейки (предупреждающий треугольник, шильдик, знаки)
// и надписи (кириллицу ChatGPT рисует с ошибками, поэтому подписи наши)
function useDoorFace(tex: Record<Key, THREE.Texture>) {
  const face = useMemo(() => {
    const W = 1024;
    const H = Math.round((W * DOOR_H) / DOOR_W);
    const px = W / DOOR_W; // пикселей на метр
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d")!;
    // сталь плиткой в 0.5 м, как и у нормалей
    const steel = tex.steel.image as CanvasImageSource;
    const t = TILE * px;
    for (let y = 0; y < H; y += t) for (let x = 0; x < W; x += t) g.drawImage(steel, x, y, t, t);
    const place = (key: Key, cx: number, cy: number, heightM: number, rot = 0) => {
      const im = tex[key].image as { width: number; height: number };
      const hh = heightM * px;
      const ww = (hh * im.width) / im.height;
      g.save();
      g.translate(cx * px, cy * px);
      g.rotate(rot);
      g.shadowColor = "rgba(0,0,0,0.45)";
      g.shadowBlur = 6;
      g.shadowOffsetY = 2;
      g.drawImage(tex[key].image as CanvasImageSource, -ww / 2, -hh / 2, ww, hh);
      g.restore();
    };
    // координаты от верхнего левого угла дверцы, метры
    place("triangle", 0.26, 0.31, 0.3, -0.02);
    place("nameplate", 0.82, 0.3, 0.2);
    place("highvoltage", DOOR_W - 0.1, 0.1, 0.1);
    place("earth", 0.1, DOOR_H - 0.1, 0.08);
    // надписи на шильдике: он светлый, текст тёмный, по центру пластины
    g.textAlign = "center";
    g.fillStyle = "#1a1a18";
    g.font = `700 ${Math.round(0.052 * px)}px 'Arial Narrow', Arial, sans-serif`;
    g.fillText("АССЕТЫ", 0.82 * px, (0.3 - 0.012) * px);
    g.font = `600 ${Math.round(0.033 * px)}px 'Arial Narrow', Arial, sans-serif`;
    g.fillText("И ОПТИМИЗАЦИЯ", 0.82 * px, (0.3 + 0.045) * px);
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.font = `500 ${Math.round(0.026 * px)}px Arial, sans-serif`;
    g.fillText("СТАТИСТИКА · ОТКРЫТЬ", (DOOR_W / 2) * px, (DOOR_H - 0.14) * px);
    const map = new THREE.CanvasTexture(cv);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return map;
  }, [tex]);
  useEffect(() => () => face.dispose(), [face]);
  return face;
}

export default function ElectricPanel({ index, onOpen }: { index: number; onOpen: (i: number) => void }) {
  const tex = usePanelTextures();
  const doorFace = useDoorFace(tex);
  const hinge = useRef<THREE.Group>(null);
  const doorFront = useRef<THREE.MeshStandardMaterial>(null);
  const leds = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const hover = useRef(false);
  const [showScreen, setShowScreen] = useState(false);
  const { w, h } = PANEL;
  const d = 0.22; // глубина шкафа

  // содержимое дисплея включается, когда дверца уже наполовину открыта, и гаснет сразу при закрытии
  useMotionValueEvent(panelDoor, "change", (v) => setShowScreen(v > 0.55));

  // нормали дверцы: плитка 0.5 м на всю лицевую грань
  const doorNormal = useMemo(() => {
    const t = tex.steelN.clone();
    t.repeat.set(DOOR_W / TILE, DOOR_H / TILE);
    t.needsUpdate = true;
    return t;
  }, [tex.steelN]);
  useEffect(() => () => doorNormal.dispose(), [doorNormal]);

  // геометрии с UV по реальным размерам (плитка стали и цинка — 0.5 м)
  const geo = useMemo(() => {
    // стальной корпус (задняя стенка, две боковины, две крышки) одним мешем: один материал, один вызов отрисовки
    const parts = [
      pbrBox(w, h, 0.02, TILE).translate(0, 0, 0.01),
      ...[-1, 1].map((s) => pbrBox(0.03, h, d, TILE, s * 0.37, 0).translate((s * (w - 0.03)) / 2, 0, d / 2)),
      ...[-1, 1].map((s) => pbrBox(w, 0.03, d, TILE, 0, s * 0.41).translate(0, (s * (h - 0.03)) / 2, d / 2)),
    ];
    const shell = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    return {
      shell,
      plate: pbrBox(w - 0.1, h - 0.1, 0.012, 0.22), // у цинка кристаллы мельче, чем у краски, плитка поменьше
      bezel: pbrBox(1.17, 0.66, 0.05, 0.3),
    };
  }, [w, h]);
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
    },
    [geo],
  );

  // автоматы на рейке: повтор набора из шести модулей, ряд по центру. 24 модуля × (корпус + лицо) сливаются в три меша:
  // бежевые корпуса, чёрные корпуса и лицевые панели с UV из атласа (было 48 мешей и столько же материалов)
  const breakers = useMemo(() => {
    const seq = Array.from({ length: REPEATS * FACES.length }, (_, i) => i % FACES.length);
    const total = seq.reduce((a, f) => a + FACES[f].u * UNIT + GAP, 0);
    const beige: THREE.BufferGeometry[] = [];
    const black: THREE.BufferGeometry[] = [];
    const faces: THREE.BufferGeometry[] = [];
    let x = -total / 2;
    let col = 0; // колонки атласа слева направо
    const colOf: number[] = [];
    FACES.forEach((f, i) => {
      colOf[i] = col;
      col += f.u;
    });
    for (const f of seq) {
      const wid = FACES[f].u * UNIT;
      const cx = x + wid / 2;
      const body = new THREE.BoxGeometry(wid, MODULE_H, 0.05).translate(cx, 0, 0);
      (FACES[f].c === "#2b2f2c" ? black : beige).push(body);
      const face = new THREE.PlaneGeometry(wid, MODULE_H);
      const uv = face.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (colOf[f] + uv.getX(i) * FACES[f].u) / FACE_UNITS);
      faces.push(face.translate(cx, 0, 0.0255));
      x += wid + GAP;
    }
    const merged = { beige: mergeGeometries(beige), black: mergeGeometries(black), faces: mergeGeometries(faces) };
    [...beige, ...black, ...faces].forEach((g) => g.dispose());
    return merged;
  }, []);
  useEffect(
    () => () => {
      Object.values(breakers).forEach((g) => g.dispose());
    },
    [breakers],
  );

  // рейка: картинка покрывает ~172 мм длины, повторяем вдоль рейки
  const rail = useMemo(() => {
    const t = tex.din.clone();
    t.repeat.set(1.21 / 0.172, 1);
    t.needsUpdate = true;
    return t;
  }, [tex.din]);
  useEffect(() => () => rail.dispose(), [rail]);

  useFrame(({ clock }) => {
    const door = panelDoor.get();
    if (hinge.current) hinge.current.rotation.y = -door * OPEN_ANGLE;
    const t = clock.elapsedTime;
    leds.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = (hover.current && door < 0.01 ? 2.4 : 1.4) + Math.sin(t * 1.4 + i * 1.7) * 0.5;
    });
    if (doorFront.current) {
      const goal = hover.current && door < 0.01 ? GLOW + 0.2 : GLOW;
      doorFront.current.emissiveIntensity += (goal - doorFront.current.emissiveIntensity) * 0.15;
    }
  });

  // у стены над статуей почти нет света, а новый источник пересобрал бы шейдеры всего зала: сталь слегка «светится» сама, как картины
  const steel = { map: tex.steel, normalMap: tex.steelN, roughness: 0.5, metalness: 0.4, emissive: "#ffffff", emissiveMap: tex.steel, emissiveIntensity: GLOW } as const;

  return (
    <group
      name="electric-panel"
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta > 6 || panelDoor.get() > 0.01) return; // перетаскивание, либо уже открыт
        onOpen(index);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (panelDoor.get() > 0.01) return;
        hover.current = true;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hover.current = false;
        document.body.style.cursor = "";
      }}
    >
      {/* корпус: задняя стенка, монтажная плата из оцинковки и четыре боковины (внутри пусто) */}
      <mesh geometry={geo.shell} receiveShadow>
        <meshStandardMaterial {...steel} />
      </mesh>
      <mesh position={[0, 0, 0.026]} geometry={geo.plate}>
        <meshStandardMaterial map={tex.zinc} normalMap={tex.zincN} roughness={0.5} metalness={0.7} />
      </mesh>

      {/* дисплей: рамка из чёрного пластика и экран, на котором рисуется статистика */}
      <mesh position={[0, 0.07, 0.055]} geometry={geo.bezel}>
        <meshStandardMaterial map={tex.black} roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.07, 0.081]}>
        <planeGeometry args={[1.1, 0.619]} />
        <meshStandardMaterial color="#050807" roughness={0.3} emissive="#0a1410" emissiveIntensity={1} />
      </mesh>
      {showScreen && (
        <Html transform position={[0, 0.07, 0.086]} scale={0.0548} zIndexRange={[20, 0]}>
          <PanelScreen />
        </Html>
      )}

      {/* DIN-рейка: тонкая подложка и лента с прорезями */}
      <mesh position={[0, -0.335, 0.04]}>
        <boxGeometry args={[1.21, 0.035, 0.008]} />
        <meshStandardMaterial color="#8d928d" roughness={0.45} metalness={0.9} />
      </mesh>
      <mesh position={[0, -0.335, 0.0445]}>
        <planeGeometry args={[1.21, 0.035]} />
        <meshStandardMaterial map={rail} alphaTest={0.5} roughness={0.45} metalness={0.8} />
      </mesh>

      {/* автоматы: корпуса двух цветов и лицевые панели с рычажками, по три слитых меша на весь ряд */}
      <group position={[0, -0.335, 0.07]}>
        <mesh geometry={breakers.beige}>
          <meshStandardMaterial color="#d9d4c4" roughness={0.6} metalness={0.05} />
        </mesh>
        <mesh geometry={breakers.black}>
          <meshStandardMaterial color="#2b2f2c" roughness={0.6} metalness={0.05} />
        </mesh>
        <mesh geometry={breakers.faces}>
          <meshStandardMaterial map={tex.atlas} alphaTest={0.5} roughness={0.55} metalness={0.05} />
        </mesh>
      </group>

      {/* дверца на левых петлях: шарнир на левой кромке, угол задаёт panelDoor */}
      <group ref={hinge} position={[-DOOR_W / 2, 0, d + 0.013]}>
        <mesh position={[DOOR_W / 2, 0, 0]}>
          {/* порядок граней BoxGeometry: +x −x +y −y +z −z; наклейки только на лицевой, изнутри — схема */}
          <boxGeometry args={[DOOR_W, DOOR_H, 0.026]} />
          {[0, 1, 2, 3].map((i) => (
            <meshStandardMaterial key={i} attach={`material-${i}`} map={tex.steel} roughness={0.5} metalness={0.4} />
          ))}
          <meshStandardMaterial ref={doorFront} attach="material-4" map={doorFace} normalMap={doorNormal} roughness={0.5} metalness={0.4} emissive="#ffffff" emissiveMap={doorFace} emissiveIntensity={GLOW} />
          <meshStandardMaterial attach="material-5" map={tex.schematic} color="#d8d2c0" roughness={0.7} metalness={0.05} />
        </mesh>
        {/* петли */}
        {[0.38, 0, -0.38].map((y) => (
          <mesh key={y} position={[0.012, y * DOOR_H, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.12, 14]} />
            <meshStandardMaterial map={tex.black} roughness={0.4} metalness={0.8} />
          </mesh>
        ))}
        {/* замок справа: латунная накладка и рычаг */}
        <mesh position={[DOOR_W - 0.1, 0, 0.022]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 24]} />
          <meshStandardMaterial map={tex.brass} roughness={0.35} metalness={0.95} />
        </mesh>
        <mesh position={[DOOR_W - 0.1, 0, 0.037]}>
          <boxGeometry args={[0.014, 0.1, 0.016]} />
          <meshStandardMaterial map={tex.brass} roughness={0.35} metalness={0.95} />
        </mesh>
        {/* индикаторы: два зелёных и один янтарный */}
        {["#3fe07a", "#f0b13a", "#3fe07a"].map((c, i) => (
          <mesh key={i} position={[DOOR_W * 0.5 + (i - 1) * 0.12, -DOOR_H * 0.36, 0.02]}>
            <sphereGeometry args={[0.018, 16, 12]} />
            <meshStandardMaterial
              ref={(m) => {
                leds.current[i] = m;
              }}
              color={c}
              emissive={c}
              emissiveIntensity={1.4}
              roughness={0.3}
            />
          </mesh>
        ))}
      </group>

      {/* кабельный ввод сверху */}
      <mesh position={[0, h / 2 + 0.07, d / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.18, 16]} />
        <meshStandardMaterial map={tex.black} color={INNER} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}
