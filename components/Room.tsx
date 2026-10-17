"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useThree } from "@react-three/fiber";
import { Html, MeshReflectorMaterial } from "@react-three/drei";
import type { MotionValue } from "motion/react";
import * as THREE from "three";
import { entries, entryMeta, museum } from "@/lib/content";
import {
  DEPTH,
  FAR_COUNT,
  FRAME_Y,
  FRAMES,
  HALF_W,
  LEFT_BOARD_Z,
  LEFT_SPOT_Z,
  RIGHT_PORTFOLIO_Z,
  RIGHT_SPOT_Z,
  ROOM_H,
  SK,
  SPOT_K,
  SPOT_OFF,
  SPOT_Y,
  SY,
} from "@/lib/gallery";
import { makeArt } from "./art";
import { usePBR } from "./pbr";
import { FacadeBody, FacadeColumns, FacadeHero, FacadeLanterns, FacadeStreet } from "./Facade";
import { LOAD_STEPS } from "./controls";
import { exhibits } from "@/lib/stack";
import { idleGate, lightSignature, warmUp } from "./stageLoad";
import MouldedFrame from "./MouldedFrame";
import Gallery, { Statues, STATUE_COUNT } from "./Gallery";
import Spot from "./Spot";
import StackWall, { EmblemsLoad } from "./StackWall";
import { ContactBoard, ExitBoard, Plaque, RANGES, WallTitle } from "./Overlay";
import ElectricPanel from "./ElectricPanel";

// Размеры зала (единицы — метры). Входная стена на z = 0, зал уходит в -z.
const H = ROOM_H;

// Масштаб HTML-табличек в 3D: 1 CSS-пиксель = HS метров
const HS = 0.26 * SK;

// Стена зала: PBR-штукатурка с рельефом и затенением, масштаб по размеру плиты
function Slab({ position, size, color = "#ffffff" }: { position: [number, number, number]; size: [number, number, number]; color?: string }) {
  const [sx, sy, sz] = size;
  const maps = usePBR("hall_wall", Math.max(sx, sz), sy, 3.2);
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial {...maps} color={color} />
    </mesh>
  );
}

// Пол зала: паркет «ёлочкой» с отражением
function Floor() {
  const maps = usePBR("hall_floor", HALF_W * 2 + 0.2, DEPTH, 3.4);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -DEPTH / 2]}>
      <planeGeometry args={[HALF_W * 2 + 0.2, DEPTH]} />
      <MeshReflectorMaterial
        blur={[300, 100]}
        resolution={512}
        mixBlur={1}
        mixStrength={5}
        depthScale={1}
        minDepthThreshold={0.4}
        {...maps}
        color="#c2a78f"
        metalness={0.1}
        mirror={0.3}
      />
    </mesh>
  );
}

type FrameProps = {
  title: string; // надпись на табличке
  sub: string;
  index: number; // сквозной индекс картины (см. FRAMES)
  tex: THREE.Texture;
  w: number;
  h: number;
  position: [number, number, number];
  rotY: number;
  progress: MotionValue<number>;
  range: readonly [number, number, number, number];
  onOpen: (i: number) => void;
};

function Frame({ title, sub, index, tex, w, h, position, rotY, progress, range, onOpen }: FrameProps) {
  // подсветка при наведении меняет материал напрямую: без React-перерисовки рамы и таблички.
  // Картина не светится сама: её освещает прожектор, поэтому лёгкий emissive нужен лишь как «подъём» при наведении.
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const glow = (v: number) => {
    if (mat.current) mat.current.emissiveIntensity = v;
  };
  const rest = 0.04;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* лепной багет из чёрного лакового дерева с жемчужной нитью, розетками и картушами */}
      <MouldedFrame w={w} h={h} />
      {/* паспарту: тёмный бархат между рамой и картиной */}
      <mesh position={[0, 0, 0.008]} receiveShadow>
        <boxGeometry args={[w + 0.02, h + 0.02, 0.02]} />
        <meshStandardMaterial color="#17120d" roughness={0.95} />
      </mesh>
      {/* стекло */}
      <mesh position={[0, 0, 0.108]} raycast={() => null}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.06} roughness={0.03} clearcoat={1} depthWrite={false} />
      </mesh>
      {/* картина */}
      <mesh
        position={[0, 0, 0.056]}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(index);
        }}
        onPointerOver={() => {
          glow(0.3);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          glow(rest);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[w * 0.92, h * 0.92]} />
        <meshStandardMaterial ref={mat} map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={rest} roughness={0.6} />
      </mesh>
      {/* табличка */}
      {/* у картин поменьше (правая стена) табличка уже, чтобы не заходить на соседние */}
      <Html transform position={[0, -(h / 2) - 0.45 * SK * Math.min(1, w / 2.6), 0.06]} scale={HS * Math.min(1, w / 2.6)}>
        <Plaque title={title} sub={sub} progress={progress} range={range} />
      </Html>
    </group>
  );
}

// Рама электрощитка (для камеры это «картина» с индексом последней записи entries)
const PANEL_FRAME = FRAMES.find((f) => entries[f.index].kind === "stats");

// Раскладка картин берётся из lib/gallery.ts: тот же источник нужен камере, чтобы подлететь к картине
const FAR_WALL = FRAMES.filter((f) => f.wall === "far").map((f) => ({ x: f.position[0], w: f.w, h: f.h }));

// Свет этапов. Число и тип источников должны быть постоянными с самого начала: иначе при каждом новом свете three пересобирает
// шейдеры всех уже показанных материалов. Поэтому пока этап не показан, вместо его настоящего света стоят нулевые заглушки того же
// типа (React меняет их на настоящие в одном коммите), а сам этап собирается скрытым.
type StageLights = { point?: number; spot?: number; shadowSpot?: number };

function LightProxies({ point = 0, spot = 0, shadowSpot = 0 }: StageLights) {
  return (
    <>
      {Array.from({ length: point }, (_, i) => (
        <pointLight key={`p${i}`} intensity={0} />
      ))}
      {Array.from({ length: spot }, (_, i) => (
        <spotLight key={`s${i}`} intensity={0} />
      ))}
      {Array.from({ length: shadowSpot }, (_, i) => (
        // castShadow нужен только ради ключа шейдера; карту теней рисуем один раз (чтобы она была создана в правильном формате) и больше не обновляем
        <spotLight key={`h${i}`} intensity={0} castShadow shadow-mapSize={[1024, 1024]} shadow-autoUpdate={false} shadow-needsUpdate />
      ))}
    </>
  );
}

// Тело этапа: монтируется, когда все его ресурсы загружены (Suspense), но остаётся скрытым. Пока он скрыт, шейдеры собираются
// параллельно и текстуры уходят в видеокарту порциями (warmUp); после этого этап показывается без единой просадки кадра.
function StageBody({ n, shown, onReady, children }: { n: number; shown: boolean; onReady: () => void; children: ReactNode }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });
  useEffect(() => {
    let dead = false;
    const g = group.current;
    if (!g) return;
    performance.mark(`stage${n}:mounted`);
    warmUp(gl, scene, camera, g, () => dead).then(() => {
      performance.mark(`stage${n}:warm`);
      if (!dead) ready.current();
    });
    return () => {
      dead = true;
    };
  }, [gl, scene, camera, n]);
  return (
    <group ref={group} visible={shown}>
      {children}
    </group>
  );
}

// Один шаг загрузки: стартует по флагу `on` (когда готов предыдущий) и в «спокойный» момент, подгружает ресурсы, прогревает
// шейдеры в скрытом виде, затем показывает этап и отмечает шаг `n` готовым. Плавного проявления нет: оно переключало бы
// transparent у материалов, а это другой шейдер, то есть вторая компиляция каждого материала.
function Stage({ n, on, setLoaded, lights, children }: { n: number; on: boolean; setLoaded: Dispatch<SetStateAction<number>>; lights?: StageLights; children: ReactNode }) {
  const [go, setGo] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on || go) return;
    let dead = false;
    idleGate(n === 1 ? 0 : 300).then(() => {
      if (!dead) setGo(true);
    });
    return () => {
      dead = true;
    };
  }, [on, go, n]);
  return (
    <>
      {!shown && lights && <LightProxies {...lights} />}
      {go && (
        <Suspense fallback={null}>
          <StageBody
            n={n}
            shown={shown}
            onReady={() => {
              setShown(true);
              setLoaded((l) => Math.max(l, n));
            }}
          >
            {children}
          </StageBody>
        </Suspense>
      )}
    </>
  );
}

// Проверка в разработке: набор света не должен меняться по ходу загрузки. Если поменялся, число заглушек в Stage не совпало с
// настоящим светом этапа, и three снова пересобирает все шейдеры (то самое зависание).
function LightAudit({ loaded }: { loaded: number }) {
  const scene = useThree((s) => s.scene);
  const base = useRef<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const sig = lightSignature(scene);
    if (base.current === null) base.current = sig;
    else if (sig !== base.current) {
      console.warn(`[stages] набор света изменился после шага ${loaded}: было ${base.current}, стало ${sig}. Поправьте lights у Stage в Room.tsx.`);
      base.current = sig;
    }
  }, [loaded, scene]);
  return null;
}

type Props = {
  progress: MotionValue<number>;
  onOpen: (i: number) => void;
  onStage?: (loaded: number) => void; // сколько шагов загрузки готово (0…LOAD_STEPS)
};

export default function Room({ progress, onOpen, onStage }: Props) {
  // Загрузка цепочкой шагов (см. LOAD_STEPS): следующий шаг стартует, когда готов предыдущий, и каждый сразу проявляется.
  const [loaded, setLoaded] = useState(0);
  useEffect(() => onStage?.(loaded), [loaded, onStage]);

  // римская цифра в углу картины считается отдельно для каждой стены; у электрощитка картины нет
  const arts = useMemo(
    () =>
      entries.map((e, i) => (e.kind === "stats" ? null : makeArt(entryMeta(e), i < FAR_COUNT ? i : i - FAR_COUNT, FRAMES[i].w / FRAMES[i].h))),
    [],
  );
  useEffect(
    () => () => {
      arts.forEach((t) => t?.dispose());
    },
    [arts],
  );

  return (
    <group>
      {/* центральный кадр фасада вне этапов: размытая заготовка видна сразу, настоящий кадр проявляется поверх */}
      <FacadeHero />
      <LightAudit loaded={loaded} />

      {/* ───── 1: улица: тротуар, бордюр, дорога. Ближе всего к зрителю, поэтому первой проступает из тумана ───── */}
      <Stage n={1} on setLoaded={setLoaded}>
        <FacadeStreet />
      </Stage>

      {/* ───── 2: фонари ───── */}
      <Stage n={2} on={loaded >= 1} setLoaded={setLoaded} lights={{ point: 2 }}>
        <FacadeLanterns />
      </Stage>

      {/* ───── 3: колонны ───── */}
      <Stage n={3} on={loaded >= 2} setLoaded={setLoaded} lights={{ point: 2 }}>
        <FacadeColumns />
      </Stage>

      {/* ───── 4: тёмная стена за кадром, боковые пролёты, дверь ───── */}
      <Stage n={4} on={loaded >= 3} setLoaded={setLoaded}>
        <FacadeBody progress={progress} />
      </Stage>

      {/* ───── 5: пол с отражениями, потолок, стены зала ───── */}
      <Stage n={5} on={loaded >= 4} setLoaded={setLoaded}>
        <Floor />
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, -DEPTH / 2]}>
          <planeGeometry args={[HALF_W * 2 + 0.2, DEPTH]} />
          <meshStandardMaterial color="#0c0d10" roughness={1} />
        </mesh>
        <Slab position={[0, H / 2, -DEPTH - 0.1]} size={[HALF_W * 2 + 0.6, H, 0.2]} color="#8a857c" />
        <Slab position={[-HALF_W - 0.1, H / 2, -DEPTH / 2 - 0.2]} size={[0.2, H, DEPTH + 0.4]} color="#8a857c" />
        <Slab position={[HALF_W + 0.1, H / 2, -DEPTH / 2 - 0.2]} size={[0.2, H, DEPTH + 0.4]} color="#8a857c" />
      </Stage>

      {/* ───── 6: каркас зала: плинтус, карниз, колонны, скамья ───── */}
      <Stage n={6} on={loaded >= 5} setLoaded={setLoaded} lights={{ spot: 1 }}>
        <Gallery progress={progress} />
      </Stage>

      {/* ───── 7: картины: места работы на дальней стене и примеры портфолио на правой ───── */}
      <Stage n={7} on={loaded >= 6} setLoaded={setLoaded}>
        {FRAMES.map((f) => {
          const e = entries[f.index];
          // электрощиток стоит на той же стене, но это объект, а не картина: он грузится отдельно, после всего зала (ниже)
          if (e.kind === "stats") return null;
          const m = entryMeta(e);
          return (
            <Frame
              key={m.id}
              title={m.title}
              sub={m.sub}
              index={f.index}
              tex={arts[f.index]!}
              w={f.w}
              h={f.h}
              position={f.position}
              rotY={f.rotY}
              progress={progress}
              range={f.wall === "far" ? RANGES.works : RANGES.portfolio}
              onOpen={onOpen}
            />
          );
        })}
      </Stage>

      {/* ───── 8: левая стена «Инструментарий»: плитки и витрины (эмблемы в них — после шага 9) ───── */}
      <Stage n={8} on={loaded >= 7} setLoaded={setLoaded} lights={{ spot: exhibits.length }}>
        <StackWall emblems={loaded >= LOAD_STEPS} />
      </Stage>

      {/* ───── 9: статуи и 3D-эмблемы ───── */}
      <Stage n={9} on={loaded >= 8} setLoaded={setLoaded} lights={{ shadowSpot: STATUE_COUNT }}>
        <Statues />
        <EmblemsLoad />
      </Stage>

      {/* электрощиток: после всех этапов и в своём Suspense, чтобы его текстуры (~0.9 МБ) не задерживали стену с картинами и статуи */}
      {loaded >= LOAD_STEPS && PANEL_FRAME && (
        <Suspense fallback={null}>
          <group position={PANEL_FRAME.position} rotation={[0, PANEL_FRAME.rotY, 0]}>
            <ElectricPanel index={PANEL_FRAME.index} onOpen={onOpen} />
          </group>
        </Suspense>
      )}

      {FAR_WALL.map((f) => (
        <Spot key={f.x} pos={[f.x, SPOT_Y, -DEPTH + SPOT_OFF]} aim={[f.x, FRAME_Y, -DEPTH]} intensity={70 * SPOT_K} shadow />
      ))}
      <Html transform position={[0, 4.15 * SY, -DEPTH + 0.06]} scale={HS}>
        <WallTitle text={museum.worksTitle} num="I" progress={progress} range={RANGES.works} />
      </Html>

      {/* ───── левая стена: «Инструментарий» — витрины с главными инструментами и стена плиток ───── */}
      <Html transform position={[-HALF_W + 0.06, 4.95, LEFT_BOARD_Z]} rotation={[0, Math.PI / 2, 0]} scale={HS}>
        <WallTitle text={museum.stackTitle} num="II" progress={progress} range={RANGES.stack} />
      </Html>
      {LEFT_SPOT_Z.map((z) => (
        <Spot key={z} pos={[-HALF_W + SPOT_OFF, SPOT_Y, z]} aim={[-HALF_W, 2.6 * SK, z]} intensity={55 * SPOT_K} />
      ))}

      {/* ───── правая стена: «Примеры портфолио» (картины — в шаге 7) ───── */}
      {/* камера смотрит на +x: её «лево» — это -z. Слева «Лендинги», посередине статуя, справа «Дизайн» и длинная «Сервисы» */}
      <Html transform position={[HALF_W - 0.06, 4.35, RIGHT_PORTFOLIO_Z]} rotation={[0, -Math.PI / 2, 0]} scale={HS * 0.42}>
        <WallTitle text={museum.portfolioTitle} num="III" progress={progress} range={RANGES.portfolio} />
      </Html>
      <Spot pos={[HALF_W - SPOT_OFF, SPOT_Y, RIGHT_SPOT_Z[0]]} aim={[HALF_W, 3.0, -12.7]} intensity={80 * SPOT_K} angle={0.6} />
      <Spot
        pos={[HALF_W - SPOT_OFF, SPOT_Y, RIGHT_SPOT_Z[1]]}
        aim={[HALF_W, 3.0, -5.0]}
        intensity={110 * SPOT_K}
        angle={0.7}
      />

      {/* ───── входная стена изнутри: контакты и выход через открытую дверь ───── */}
      {/* камера смотрит на +z: мировой +x у неё слева. Контакты — над низкой статуей настольных игр (x = +4), выход — над дверью */}
      <Html transform position={[4.4, 4.75, -0.26]} rotation={[0, Math.PI, 0]} scale={HS * 0.85}>
        <ContactBoard progress={progress} />
      </Html>
      <Html transform position={[0, 5.55, -0.26]} rotation={[0, Math.PI, 0]} scale={HS * 0.42}>
        <ExitBoard progress={progress} />
      </Html>
      <Spot pos={[0, SPOT_Y, -3.6]} aim={[0, 5.4, -0.2]} intensity={22 * SPOT_K} fixture={false} />

      {/* свет снаружи: дверь и широкая заливка стены, чтобы фасад читался */}
      <Spot pos={[0, 7, 7]} aim={[0, 2.2, 0]} intensity={160} angle={0.5} fixture={false} color="#d4def5" />
      <Spot pos={[0, 11, 16]} aim={[0, 4, 0]} intensity={380} angle={0.95} fixture={false} color="#d4def5" />
      <Spot pos={[-10, 6, 10]} aim={[-8, 3, 0]} intensity={140} angle={0.8} fixture={false} color="#d4def5" />
      <Spot pos={[10, 6, 10]} aim={[8, 3, 0]} intensity={140} angle={0.8} fixture={false} color="#d4def5" />
    </group>
  );
}
