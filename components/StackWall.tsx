"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { HALF_W, LEFT_BOARD_Z } from "@/lib/gallery";
import { exhibits, stackGroups, type ExhibitId, type TileDef } from "@/lib/stack";
import { statueApi, statueFocus } from "./controls";
import Spot from "./Spot";
import BrassPlate from "./BrassPlate";
import { pbrBox, scaleUV, useSharedPBR } from "./pbr";
import { asset } from "@/lib/asset";

// Левая стена «Инструментарий». Локальные оси группы: +x — вправо с точки зрения камеры, +z — от стены в зал, y — вверх.
const BRASS = "#b8924f";
const FONT = "Georgia, 'Times New Roman', serif";

type V3 = [number, number, number];

function useCanvasTexture(w: number, h: number, key: string, draw: (g: CanvasRenderingContext2D) => void) {
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    draw(cv.getContext("2d")!);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, key]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 400) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 12) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

// Брусок с фотореальным набором (шпон ореха, тёмное дерево): UV по граням в реальных метрах
function PBRBox({
  set,
  pos,
  size,
  tile = 0.9,
  color = "#ffffff",
  roughness = 1,
  castShadow = true,
  seed = 0,
}: {
  set: "walnut" | "panel";
  pos: V3;
  size: V3;
  tile?: number;
  color?: string;
  roughness?: number;
  castShadow?: boolean;
  seed?: number; // сдвиг рисунка, чтобы одинаковые бруски не повторяли друг друга
}) {
  const maps = useSharedPBR(set);
  const [w, h, d] = size;
  const [px, py, pz] = pos;
  const geo = useMemo(() => pbrBox(w, h, d, tile, px * 0.31 + pz * 0.17 + seed * 0.29, py * 0.43 + seed * 0.11), [w, h, d, tile, px, py, pz, seed]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh position={pos} geometry={geo} castShadow={castShadow} receiveShadow>
      <meshStandardMaterial {...maps} color={color} roughness={roughness} />
    </mesh>
  );
}

// ───────── Стена плиток ─────────
const PITCH = 0.58; // шаг плиток
const TILE = 0.52;
const COLS = 3;
const BLOCK_PITCH = 2.2; // шаг блоков-групп вдоль стены
const BOARD_TOP = 4.15; // верх первого ряда плиток
const HOVER_OUT = 0.1; // на сколько выдвигается плитка при наведении

function Tile({ tile, color, index, pos }: { tile: TileDef; color: string; index: number; pos: V3 }) {
  const group = useRef<THREE.Group>(null!);
  const hot = useRef(false);
  const glow = useRef(0.22);

  const map = useCanvasTexture(
    256,
    256,
    `${tile.sym}|${tile.name}|${color}|${index}`,
    (g) => {
      const bg = g.createLinearGradient(0, 0, 256, 256);
      bg.addColorStop(0, "#241d16");
      bg.addColorStop(1, "#14100c");
      g.fillStyle = bg;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = color;
      g.globalAlpha = 0.75;
      g.lineWidth = 5;
      g.strokeRect(8, 8, 240, 240);
      g.globalAlpha = 1;
      g.fillStyle = color;
      g.textAlign = "left";
      g.font = `400 28px ${FONT}`;
      g.fillText(String(index + 1).padStart(2, "0"), 22, 46);
      g.textAlign = "center";
      g.font = `500 112px ${FONT}`;
      g.fillText(tile.sym, 128, 148);
      g.fillStyle = "#e9e2d4";
      fitText(g, tile.name, 212, 30);
      g.fillText(tile.name, 128, 218);
    },
  );

  const front = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, dt) => {
    const target = hot.current ? HOVER_OUT : 0;
    const g = group.current;
    if (Math.abs(g.position.z - pos[2] - target) > 0.0005) g.position.z = THREE.MathUtils.damp(g.position.z, pos[2] + target, 10, dt);
    const gt = hot.current ? 0.85 : 0.22;
    if (Math.abs(glow.current - gt) > 0.004) {
      glow.current = THREE.MathUtils.damp(glow.current, gt, 10, dt);
      if (front.current) front.current.emissiveIntensity = glow.current;
    }
  });

  return (
    <group ref={group} position={pos}>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0, 0.03]}
        onPointerOver={(e) => {
          e.stopPropagation();
          hot.current = true;
        }}
        onPointerOut={() => {
          hot.current = false;
        }}
      >
        <boxGeometry args={[TILE, TILE, 0.06]} />
        {[0, 1, 2, 3, 5].map((i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color="#2a2018" roughness={0.5} metalness={0.6} />
        ))}
        <meshStandardMaterial ref={front} attach="material-4" map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.22} roughness={0.4} />
      </mesh>
    </group>
  );
}

// Морёный дуб: десятилетиями лежал в воде, поэтому почти чёрный, с холодным серо-коричневым оттенком и еле заметными волокнами.
// Берём текстуру дерева из набора panel, убираем почти весь цвет и сильно затемняем; нормали и шероховатость остаются родными.
const bogOakCache = new WeakMap<object, THREE.CanvasTexture>();
function useBogOak() {
  const maps = useSharedPBR("panel");
  return useMemo(() => {
    if (!bogOakCache.has(maps.map)) {
      const src = maps.map.image as CanvasImageSource;
      const s = 1024;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const g = cv.getContext("2d")!;
      g.drawImage(src, 0, 0, s, s);
      const px = g.getImageData(0, 0, s, s);
      for (let i = 0; i < px.data.length; i += 4) {
        const lum = 0.3 * px.data[i] + 0.59 * px.data[i + 1] + 0.11 * px.data[i + 2];
        // тёмно-серо-коричневый тон: рисунок волокон сохраняем, но сжимаем к тёмному краю
        const v = 18 + lum * 0.32;
        px.data[i] = v * 1.05;
        px.data[i + 1] = v * 0.99;
        px.data[i + 2] = v * 0.93;
      }
      g.putImageData(px, 0, 0);
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      bogOakCache.set(maps.map, t);
    }
    return { ...maps, map: bogOakCache.get(maps.map) };
  }, [maps]);
}

// Панель стеллажа из морёного дуба: UV по реальным размерам, как у PBRBox
function BogOakPanel({ pos, size, tile = 1.4 }: { pos: V3; size: V3; tile?: number }) {
  const maps = useBogOak();
  const [w, h, d] = size;
  const geo = useMemo(() => pbrBox(w, h, d, tile), [w, h, d, tile]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh position={pos} geometry={geo} receiveShadow>
      <meshStandardMaterial {...maps} color="#ffffff" roughness={0.78} metalness={0.05} />
    </mesh>
  );
}

// Оглавление блока: латунная табличка с гравировкой, такая же, как на постаментах и витринах
function GroupHeader({ title, x, y }: { title: string; x: number; y: number }) {
  return <BrassPlate title={title} pos={[x, y, 0.055]} w={1.7} h={0.36} />;
}

function TileBoard() {
  const { tiles, headers } = useMemo(() => {
    const tiles: { tile: TileDef; color: string; index: number; pos: V3 }[] = [];
    const headers: { title: string; color: string; x: number }[] = [];
    let n = 0;
    stackGroups.forEach((grp, gi) => {
      const cx = (gi - (stackGroups.length - 1) / 2) * BLOCK_PITCH;
      headers.push({ title: grp.title, color: grp.color, x: cx });
      grp.tiles.forEach((tile, i) => {
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        tiles.push({
          tile,
          color: grp.color,
          index: n++,
          pos: [cx + (c - (COLS - 1) / 2) * PITCH, BOARD_TOP - TILE / 2 - r * PITCH, 0.055],
        });
      });
    });
    return { tiles, headers };
  }, []);

  const w = BLOCK_PITCH * stackGroups.length + 0.4;
  const top = BOARD_TOP + 0.5;
  const bottom = BOARD_TOP - 3 * PITCH - 0.05;
  const h = top - bottom;
  return (
    <group>
      {/* тёмная панель-«шкаф» с латунной окантовкой */}
      <BogOakPanel pos={[0, (top + bottom) / 2, 0.03]} size={[w, h, 0.05]} />
      {[top, bottom].map((y) => (
        <mesh key={y} position={[0, y, 0.06]}>
          <boxGeometry args={[w + 0.08, 0.04, 0.07]} />
          <meshStandardMaterial color={BRASS} metalness={1} roughness={0.32} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (w + 0.04)) / 2, (top + bottom) / 2, 0.06]}>
          <boxGeometry args={[0.04, h, 0.07]} />
          <meshStandardMaterial color={BRASS} metalness={1} roughness={0.32} />
        </mesh>
      ))}
      {headers.map((hd, i) => (
        <GroupHeader key={hd.title} title={hd.title} x={hd.x} y={BOARD_TOP + 0.27} />
      ))}
      {tiles.map((t) => (
        <Tile key={t.tile.sym + t.tile.name} {...t} />
      ))}
    </group>
  );
}

// ───────── 3D-экспонаты: стилизованные формы, а не логотипы ─────────
function useSpin(speed = 0.5, bob = 0.025) {
  const ref = useRef<THREE.Group>(null!);
  useFrame((state, dt) => {
    ref.current.rotation.y += dt * speed;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 1.2) * bob;
  });
  return ref;
}

function ReactShape() {
  const ref = useSpin(0.5);
  const ring = useMemo(() => {
    const pts = new THREE.EllipseCurve(0, 0, 0.38, 0.145, 0, Math.PI * 2, false, 0)
      .getPoints(120)
      .map((p) => new THREE.Vector3(p.x, p.y, 0));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.022, 14, true);
  }, []);
  useEffect(() => () => ring.dispose(), [ring]);
  const mat = <meshPhysicalMaterial color="#7fd8f0" metalness={1} roughness={0.12} clearcoat={1} envMapIntensity={1.7} />;
  return (
    <group ref={ref} rotation={[0.25, 0, 0.1]}>
      <mesh castShadow>
        <sphereGeometry args={[0.075, 32, 32]} />
        {mat}
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={ring} rotation={[0, 0, (i * Math.PI) / 3]} castShadow>
          {mat}
        </mesh>
      ))}
    </group>
  );
}

// ───────── Эмблемы JS, Playwright и Next.js: настоящие 3D-модели ─────────
// Сделаны по листам с четырьмя видами (ChatGPT) в ComfyUI (Hunyuan3D 2.0 MV), цвет перенесён с видов, доведены в Blender.
// Начало координат — центр модели, лицо смотрит в +z.
const EMBLEMS = {
  javascript: asset("/models/emblem_js.glb"),
  testing: asset("/models/emblem_playwright.glb"),
  next: asset("/models/emblem_next.glb"),
};

// Подгружает все три эмблемы разом (суспендит), чтобы витрины потом показали их без паузы. Без preload на уровне модуля.
export function EmblemsLoad() {
  useGLTF(Object.values(EMBLEMS));
  return null;
}

function GlbEmblem({ url }: { url: string }) {
  const ref = useSpin(0.5, 0.025);
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.roughness = 0.8;
      mat.metalness = 0;
      mat.envMapIntensity = 0.3;
    });
    return root;
  }, [scene]);
  return (
    <group ref={ref}>
      <primitive object={model} />
    </group>
  );
}

const JavaScriptShape = () => <GlbEmblem url={EMBLEMS.javascript} />;
const NextShape = () => <GlbEmblem url={EMBLEMS.next} />;
const TestingShape = () => <GlbEmblem url={EMBLEMS.testing} />;

const SHAPES: Record<ExhibitId, () => React.JSX.Element> = {
  javascript: JavaScriptShape,
  react: ReactShape,
  next: NextShape,
  testing: TestingShape,
};

// ───────── Витрина ─────────
const V_W = 1.1;
const V_D = 0.9;
const PLINTH_H = 0.7;
const GLASS_H = 1.42;
const VIT_Z = 0.25 + V_D / 2; // отступ от стены
const SLOT_X = [-4.4, -2.2, 2.2, 4.4];

function Brass({ pos, size }: { pos: V3; size: V3 }) {
  return (
    <mesh position={pos} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={BRASS} metalness={1} roughness={0.32} />
    </mesh>
  );
}

// Мировые координаты точки в локальной системе группы стены: локальный +x — это мировой −z, локальный +z — мировой +x
const toWorld = (lx: number, lz: number): [number, number] => [-HALF_W + lz, LEFT_BOARD_Z - lx];

// Круглая мраморная подставка под экспонат
function RoundStand() {
  const maps = useSharedPBR("marble");
  const geo = useMemo(() => scaleUV(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 40), 1.6, 0.25), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh position={[0, PLINTH_H + 0.05, 0]} geometry={geo} receiveShadow>
      <meshStandardMaterial {...maps} color="#f1ede4" roughness={0.9} />
    </mesh>
  );
}

function Vitrine({ id, x, title, sub, emblems }: { id: ExhibitId; x: number; title: string; sub: string; emblems: boolean }) {
  const Shape = SHAPES[id];
  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // это было перетаскивание, а не клик
    const [wx, wz] = toWorld(x, VIT_Z);
    statueApi.open({ id, x: wx + 3.2, y: 1.45, z: wz, yaw: Math.PI / 2, tx: wx, tz: wz });
  };
  const top = PLINTH_H + GLASS_H;
  return (
    <group
      position={[x, 0, VIT_Z]}
      onClick={open}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (statueFocus.get() < 0.5) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      {/* цоколь: тёмный орех, латунный пояс, табличка на лицевой стороне */}
      <PBRBox set="walnut" pos={[0, PLINTH_H / 2, 0]} seed={x} size={[V_W, PLINTH_H, V_D]} tile={0.9} color="#c9bdb2" roughness={0.85} />
      <Brass pos={[0, PLINTH_H - 0.04, 0]} size={[V_W + 0.04, 0.04, V_D + 0.04]} />
      <Brass pos={[0, 0.03, 0]} size={[V_W + 0.04, 0.06, V_D + 0.04]} />
      <BrassPlate title={sub} pos={[0, PLINTH_H * 0.5, V_D / 2]} w={0.86} h={0.3} />

      {/* стеклянный колпак: четыре латунные стойки, верхняя рама и тонкое стекло */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Brass key={`${sx}${sz}`} pos={[(sx * (V_W - 0.04)) / 2, PLINTH_H + GLASS_H / 2, (sz * (V_D - 0.04)) / 2]} size={[0.035, GLASS_H, 0.035]} />
        )),
      )}
      <mesh position={[0, PLINTH_H + 0.01 + (GLASS_H - 0.02) / 2, 0]}>
        <boxGeometry args={[V_W - 0.04, GLASS_H - 0.02, V_D - 0.04]} />
        <meshPhysicalMaterial color="#d6e8ff" transparent opacity={0.09} roughness={0.02} metalness={0} envMapIntensity={1.6} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <PBRBox set="walnut" pos={[0, top + 0.04, 0]} seed={x + 1} size={[V_W + 0.04, 0.08, V_D + 0.04]} tile={0.9} color="#c9bdb2" roughness={0.85} />
      <Brass pos={[0, top, 0]} size={[V_W + 0.06, 0.025, V_D + 0.06]} />
      {/* тёплая подсветка из-под крышки */}
      <mesh position={[0, top - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[V_W - 0.16, V_D - 0.16]} />
        <meshBasicMaterial color="#ffe6b8" toneMapped={false} />
      </mesh>
      <Spot pos={[0, top - 0.06, 0.05]} aim={[0, PLINTH_H + 0.6, 0]} intensity={16} angle={0.7} fixture={false} color="#ffe6c4" />

      {/* круглая подставка и сам экспонат */}
      <RoundStand />
      <group position={[0, PLINTH_H + 0.72, 0]} scale={1.15}>
        {/* GLB-эмблемы появляются на третьем этапе; React-атом рисуется сразу */}
        {(emblems || id === "react") && (
          <Suspense fallback={null}>
            <Shape />
          </Suspense>
        )}
      </group>
    </group>
  );
}

// ───────── Стена целиком ─────────
export default function StackWall({ emblems = false }: { emblems?: boolean }) {
  return (
    <group position={[-HALF_W, 0, LEFT_BOARD_Z]} rotation={[0, Math.PI / 2, 0]}>
      <TileBoard />
      {exhibits.map((ex, i) => (
        <Vitrine key={ex.id} id={ex.id} x={SLOT_X[i]} title={ex.title} sub={ex.sub} emblems={emblems} />
      ))}
    </group>
  );
}
