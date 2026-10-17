"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import type { MotionValue } from "motion/react";
import * as THREE from "three";
import { DOOR_H, DOOR_W } from "@/lib/gallery";
import { doorHandle } from "./controls";
import { HERO_PLACEHOLDER } from "./heroPlaceholder";
import { applyMist, mistSignals } from "./MistLayer";
import { useSharedPBR } from "./pbr";
import StoneColumn from "./StoneColumn";
import { asset } from "@/lib/asset";

// Фасад — цельный кадр центра дома (public/facade/kit/hero.webp, 4096 px) с вырезом под дверь, края растушёваны в тёмную стену.
// Масштаб по проёму портала на картинке: 583 × 1195 px = DOOR_W × DOOR_H метров (по осям отдельно).
const HERO_PX = [4096, 2697] as const; // кадр уже обрезан по линии земли
const HERO_OPEN = { w: 583, h: 1195, cx: 2043.5, bottom: 2694 };
const HERO_SX = DOOR_W / HERO_OPEN.w; // м на пиксель по горизонтали
const HERO_SY = DOOR_H / HERO_OPEN.h; // м на пиксель по вертикали
const HERO_W = HERO_PX[0] * HERO_SX;
const HERO_H = HERO_PX[1] * HERO_SY;
const HALF = 30; // стена за кадром уходит на 30 м в каждую сторону
const WALL_H = 12;
const Z = 0.205; // кадр лежит перед стеной

// Лампы на картинке (px) → метры
const LAMP_X = [1372, 2715]; // оси фонарей на картинке (px); фонари объёмные
const px2y = (py: number) => (HERO_OPEN.bottom - py) * HERO_SY;

function outline(w: number, h: number) {
  const r = w / 2;
  const p = new THREE.Shape();
  p.moveTo(-r, 0);
  p.lineTo(-r, h - r);
  p.absarc(0, h - r, r, Math.PI, 0, true);
  p.lineTo(r, 0);
  p.lineTo(-r, 0);
  return p;
}

// Клон текстуры: чёткость под косые углы, повтор с зеркалированием (стыки не видны)
function useKit(
  url: string,
  repeat?: [number, number],
  offset?: [number, number],
  mirror = false,
  srgb = true,
) {
  const tex = useTexture(url);
  const t = useMemo(() => {
    const c = tex.clone();
    c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    c.anisotropy = 16;
    if (repeat) {
      c.wrapS = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      c.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      c.repeat.set(...repeat);
      if (offset) c.offset.set(...offset);
    }
    c.needsUpdate = true;
    return c;
  }, [tex, repeat, offset, mirror, srgb]);
  useEffect(() => () => t.dispose(), [t]);
  return t;
}

const DUSK = "#b4b9c8"; // лёгкое «вечернее» затемнение дневных картинок

// Тёмная стена за слоями: продолжение за краями и выше карниза, с проходом под дверь.
// Без текстур: центр целиком закрыт кадром, виден только откос проёма (0.4 м), а штукатурка стоила ~28 МБ видеопамяти.
function BackWall() {
  const geo = useMemo(() => {
    const W = 8;
    const s = new THREE.Shape();
    s.moveTo(-W / 2, -0.3);
    s.lineTo(W / 2, -0.3);
    s.lineTo(W / 2, WALL_H);
    s.lineTo(-W / 2, WALL_H);
    s.lineTo(-W / 2, -0.3);
    const hole = new THREE.Path();
    hole.setFromPoints(outline(DOOR_W, DOOR_H).getPoints(32));
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.4,
      bevelEnabled: false,
      curveSegments: 32,
    });
    g.translate(0, 0, -0.2);
    return g;
  }, []);
  const sideW = HALF - 4;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[(s * (HALF + 4)) / 2, WALL_H / 2, 0]}
          receiveShadow
        >
          <boxGeometry args={[sideW, WALL_H, 0.4]} />
          <meshStandardMaterial color="#3e3c39" roughness={0.9} />
        </mesh>
      ))}
      <mesh geometry={geo} receiveShadow>
        <meshStandardMaterial color="#3e3c39" roughness={0.9} />
      </mesh>
    </group>
  );
}

// Боковые пролёты (по образцу центра): окна повторяются с тем же шагом, что у центрального кадра
const PITCH = 465 * (HERO_PX[0] / 1536) * HERO_SX; // расстояние между осями окон ≈ 4.68 м
const SIDE_X0 = PITCH * 1.5; // граница пролётов: заходит под растушёванный край кадра
const BAND_Y = (HERO_OPEN.bottom - 1307) * HERO_SY; // низ пояса между этажами ≈ 5.34 м

function SideBays() {
  // ряды руста боковой плитки подогнаны к рядам центрального кадра (шаг 0.41 м)
  const G_H = 1406 * 0.0044; // высота плитки в метрах
  const G_YB = -0.634; // мировая высота низа плитки
  const ground = useKit(
    asset("/facade/kit/side_ground.webp"),
    [(HALF - SIDE_X0) / PITCH, BAND_Y / G_H],
    [0, -G_YB / G_H],
    true,
  );
  const upper = useKit(
    asset("/facade/kit/side_upper.webp"),
    [(HALF - SIDE_X0) / PITCH, 1],
    undefined,
    true,
  );
  const len = HALF - SIDE_X0;
  const cx = SIDE_X0 + len / 2;
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * cx, 0, Z - 0.004]} scale={[s, 1, 1]}>
          <mesh position={[0, BAND_Y / 2, 0]} receiveShadow>
            <planeGeometry args={[len, BAND_Y]} />
            <meshStandardMaterial
              map={ground}
              emissiveMap={ground}
              emissive="#ffffff"
              emissiveIntensity={0.3}
              color={DUSK}
              roughness={0.95}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, BAND_Y + (HERO_H - BAND_Y) / 2, 0]} receiveShadow>
            <planeGeometry args={[len, HERO_H - BAND_Y]} />
            <meshStandardMaterial
              map={upper}
              emissiveMap={upper}
              emissive="#ffffff"
              emissiveIntensity={0.3}
              color={DUSK}
              roughness={0.95}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Объёмный фонарь: модель из Blender (public/models/lantern.glb), слеплена по чертежу. Начало координат — на стене,
// на оси фонаря; нижний кончик капли на нуле, поэтому ставим его на высоту кончика на фасаде.
function Lantern({ cx }: { cx: number }) {
  const { scene } = useGLTF(asset("/models/lantern.glb"));
  const model = useMemo(() => scene.clone(true), [scene]);
  // туман загрузки подмешивается в материалы до первой компиляции (она идёт после эффектов детей, в прогреве этапа)
  useEffect(() => applyMist(model, "lanterns"), [model]);
  const x = (cx - HERO_OPEN.cx) * HERO_SX;
  const yTip = px2y(1915);
  return (
    <group position={[x, yTip, Z]}>
      <primitive object={model} />
      <pointLight
        position={[0, 0.85, 0.95]}
        intensity={9}
        distance={12}
        decay={2}
        color="#ffcf94"
      />
    </group>
  );
}

// Грузит текстуру без Suspense: пока её нет, возвращает null. Так сцена не ждёт тяжёлую картинку.
function useLazyTexture(url: string, srgb: boolean) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(url, (t) => {
      if (cancelled) {
        t.dispose();
        return;
      }
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 16;
      t.needsUpdate = true;
      loaded = t;
      setTex(t);
    });
    return () => {
      cancelled = true;
      loaded?.dispose();
    };
  }, [url, srgb]);
  return tex;
}

const HERO_POS: [number, number, number] = [
  (HERO_PX[0] / 2 - HERO_OPEN.cx) * HERO_SX,
  HERO_H / 2,
  Z,
];
const FADE_SEC = 0.9; // за сколько кадр проявляется поверх заготовки

// Центральный кадр дома. Рисуется сразу: сначала крошечная размытая заготовка (вшита в код), затем
// настоящий кадр плавно проявляется поверх неё, когда докачается. Карта рельефа подключается ещё позже.
// Кадр прозрачный (растушёванные края и проём), но не пишет глубину и рисуется первым среди прозрачных:
// иначе его мягкий край в проёме то закрывает дверь, то нет — порядок прозрачных объектов меняется вместе с камерой.
export function FacadeHero() {
  const placeholder = useMemo(() => {
    const t = new THREE.TextureLoader().load(HERO_PLACEHOLDER);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => placeholder.dispose(), [placeholder]);

  const hero = useLazyTexture(asset("/facade/kit/hero.webp"), true);
  // карту рельефа берём только после кадра, чтобы не отнимать у него канал
  const heroNormal = useLazyTexture(
    hero ? asset("/facade/kit/hero_normal.webp") : "",
    false,
  );
  const normalScale = useMemo(() => new THREE.Vector2(1.4, 1.4), []);
  // сигнал для тумана загрузки: кадр и его карта рельефа пришли (см. MistLayer)
  useEffect(() => {
    if (hero && heroNormal) mistSignals.heroReady = true;
  }, [hero, heroNormal]);

  const base = useRef<THREE.Mesh>(null);
  const full = useRef<THREE.MeshStandardMaterial>(null);
  const fade = useRef(0);
  useFrame((_, dt) => {
    if (!hero || fade.current >= 1) return;
    fade.current = Math.min(1, fade.current + dt / FADE_SEC);
    const o = fade.current * fade.current * (3 - 2 * fade.current);
    if (full.current) full.current.opacity = o;
    // когда полный кадр непрозрачен, заготовка не нужна: иначе она утолщала бы мягкие края
    if (fade.current >= 1 && base.current) base.current.visible = false;
  });
  // карта рельефа появилась позже самого материала: перекомпилировать шейдер
  useEffect(() => {
    if (full.current) full.current.needsUpdate = true;
  }, [heroNormal]);

  return (
    <group>
      <mesh ref={base} position={HERO_POS} receiveShadow renderOrder={-2}>
        <planeGeometry args={[HERO_W, HERO_H]} />
        <meshStandardMaterial
          map={placeholder}
          emissiveMap={placeholder}
          emissive="#ffffff"
          emissiveIntensity={0.2}
          color={DUSK}
          roughness={0.95}
          transparent
          depthWrite={false}
          alphaTest={0.01}
        />
      </mesh>
      {hero && (
        <mesh position={HERO_POS} receiveShadow renderOrder={-1}>
          <planeGeometry args={[HERO_W, HERO_H]} />
          <meshStandardMaterial
            ref={full}
            map={hero}
            normalMap={heroNormal}
            normalScale={normalScale}
            emissiveMap={hero}
            emissive="#ffffff"
            emissiveIntensity={0.2}
            color={DUSK}
            roughness={0.95}
            transparent
            opacity={0}
            depthWrite={false}
            alphaTest={0.01}
          />
        </mesh>
      )}
    </group>
  );
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

// Дерево торца створки
function WoodMat() {
  const maps = useSharedPBR("walnut"); // общий набор с постаментами StackWall: одна копия на GPU, а не по экземпляру
  return <meshPhysicalMaterial {...maps} color="#5a3a22" clearcoat={0.3} />;
}

// ── Дверь: части из набора public/facade/kit/ (фрамуга, створки снаружи и изнутри, карта нормалей, плашка и рычаг) ──
const DOOR_YT = DOOR_H - 1.2; // низ фрамуги = верх створок: фрамуга 1.2 м, створки ниже
const LEAF_H = DOOR_YT;
const LEAF_W = DOOR_W / 2; // каждая створка 1.1 м
// размеры картинок (px) и стёкол на них — по ним ставятся 3D-стёкла и сердцевина створки
const IN_W = 862;
const OUT_W = 912;
const OUT_H = 1484;
const GLASS_IN = [84, 92, 349, 590]; // левая створка, внутренняя картинка
const GLASS_OUT = [82, 78, 369, 751]; // левая створка, внешняя картинка
const toX = (px: number, w: number) => (px / w) * DOOR_W - DOOR_W / 2; // x в метрах на всей двери
const toY = (py: number, h: number) => LEAF_H * (1 - py / h); // y в метрах от пола
const GLASS_X0 = toX(GLASS_IN[0], IN_W); // левый край стекла левой створки
const GLASS_X1 = toX(GLASS_IN[2], IN_W); // правый край
const GLASS_Y0_OUT = toY(GLASS_OUT[3], OUT_H); // низ стекла снаружи (ниже, чем изнутри)
const GLASS_Y1_OUT = toY(GLASS_OUT[1], OUT_H); // верх стекла снаружи
// где на створке нарисована замочная скважина (px на внешней картинке) → метры; плашка ручки крепится по ней
const KEY_X = toX(414, OUT_W); // левая створка
const KEY_Y = toY(820, OUT_H);
const PLATE_H = 0.34;
const PLATE_W = PLATE_H * (232 / 973);
const PIVOT_UP = ((675 - 400) / 973) * PLATE_H; // ось рычага выше скважины
const LEVER_W = 0.2;
const LEVER_H = LEVER_W * (180 / 573);
const LEVER_CX = (((300 + 873) / 2 - 268) / 573) * LEVER_W; // центр рычага относительно оси

// Прямоугольная плоскость створки с UV по всей двери (u по x двери, v по высоте створки)
function leafPlane(x0: number, x1: number, back: boolean) {
  const s = new THREE.Shape();
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  s.lineTo(x1, LEAF_H);
  s.lineTo(x0, LEAF_H);
  s.lineTo(x0, 0);
  const g = new THREE.ShapeGeometry(s);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / DOOR_W + 0.5;
    uv.setXY(i, back ? 1 - u : u, pos.getY(i) / LEAF_H);
  }
  return g;
}

// Рычажная ручка с плашкой с обеих сторон створки. Рычаг — плоский спрайт из вашей картинки, поворачивается вокруг оси розетки.
// out — куда торчит рычаг в мире: −1 влево, +1 вправо (у створок наружу, от центра).
function Handle({
  keyX,
  out,
  plate,
  lever,
  leverRef,
}: {
  keyX: number;
  out: -1 | 1;
  plate: THREE.Texture;
  lever: THREE.Texture;
  leverRef: (el: THREE.Group | null, dir: number) => void;
}) {
  return (
    <>
      {([1, -1] as const).map((side) => {
        // на обратной стороне группа развёрнута вокруг y, поэтому локальное направление рычага меняется
        const dl = side === 1 ? out : (-out as -1 | 1);
        return (
          <group
            key={side}
            position={[keyX, KEY_Y + PIVOT_UP, 0.035 * side]}
            rotation={[0, side === 1 ? 0 : Math.PI, 0]}
          >
            <mesh position={[0, -PLATE_H / 2 + PIVOT_UP, 0]} castShadow>
              <planeGeometry args={[PLATE_W, PLATE_H]} />
              <meshStandardMaterial
                map={plate}
                metalness={0.6}
                roughness={0.45}
                transparent
                alphaTest={0.5}
              />
            </mesh>
            <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.032, 0.036, 0.024, 22]} />
              <meshStandardMaterial
                color="#8c6a3a"
                metalness={1}
                roughness={0.35}
              />
            </mesh>
            <group ref={(el) => leverRef(el, dl)}>
              <mesh
                position={[dl * LEVER_CX, 0, 0.03]}
                scale={[dl, 1, 1]}
                castShadow
              >
                <planeGeometry args={[LEVER_W, LEVER_H]} />
                <meshStandardMaterial
                  map={lever}
                  metalness={0.6}
                  roughness={0.4}
                  transparent
                  alphaTest={0.5}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          </group>
        );
      })}
    </>
  );
}

// Створка: ось петель на краю проёма. Снаружи резьба с рельефом, внутри проще, между ними сердцевина и чистое стекло.
function Leaf({
  side,
  outer,
  inner,
  normal,
  plate,
  lever,
  groupRef,
  leverRef,
}: {
  side: -1 | 1;
  outer: THREE.Texture;
  inner: THREE.Texture;
  normal: THREE.Texture;
  plate: THREE.Texture;
  lever: THREE.Texture;
  groupRef: RefObject<THREE.Group | null>;
  leverRef: (el: THREE.Group | null, dir: number) => void;
}) {
  const hingeX = side * LEAF_W; // ось петель: у левой створки x = −1.1, у правой +1.1
  const x0 = side === -1 ? -LEAF_W : 0; // в координатах всей двери: левая −1.1…0, правая 0…1.1
  const x1 = x0 + LEAF_W;
  const front = useMemo(() => {
    const g = leafPlane(x0, x1, false);
    g.translate(-hingeX, 0, 0);
    return g;
  }, [x0, x1, hingeX]);
  const back = useMemo(() => {
    const g = leafPlane(x0, x1, true);
    g.translate(-hingeX, 0, 0);
    return g;
  }, [x0, x1, hingeX]);
  const normalScale = useMemo(() => new THREE.Vector2(1.2, 1.2), []);
  const glassW = GLASS_X1 - GLASS_X0;
  const inDir = side === -1 ? 1 : -1; // от петли внутрь створки (в локальных координатах группы)
  const glassCx = inDir * (0.2 + glassW / 2); // стекло лежит за стойкой у петли шириной 0.2
  const glassCy = (GLASS_Y0_OUT + GLASS_Y1_OUT) / 2;
  return (
    <group ref={groupRef} position={[hingeX, 0, 0]}>
      <mesh geometry={front} position={[0, 0, 0.032]}>
        <meshStandardMaterial
          map={outer}
          normalMap={normal}
          normalScale={normalScale}
          roughness={0.55}
          metalness={0.05}
          emissive="#ffffff"
          emissiveMap={outer}
          emissiveIntensity={0.1}
          color="#d6d0cc"
          transparent
          alphaTest={0.5}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh geometry={back} position={[0, 0, -0.032]}>
        <meshStandardMaterial
          map={inner}
          roughness={0.55}
          metalness={0.05}
          emissive="#ffffff"
          emissiveMap={inner}
          emissiveIntensity={0.1}
          color="#d6d0cc"
          transparent
          alphaTest={0.5}
          side={THREE.BackSide}
        />
      </mesh>
      {/* стекло между плоскостями: чистое, с отражением окружения */}
      <mesh position={[glassCx, glassCy, 0]} renderOrder={2}>
        <planeGeometry args={[glassW, GLASS_Y1_OUT - GLASS_Y0_OUT]} />
        <meshPhysicalMaterial
          color="#dfeaf2"
          transparent
          opacity={0.1}
          roughness={0.03}
          metalness={0}
          clearcoat={1}
          envMapIntensity={1.6}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* сердцевина там, где с обеих сторон дерево: низ, верхняя перекладина и боковые стойки */}
      <mesh position={[inDir * LEAF_W * 0.5, GLASS_Y0_OUT / 2, 0]}>
        <boxGeometry args={[LEAF_W, GLASS_Y0_OUT, 0.056]} />
        <WoodMat />
      </mesh>
      <mesh position={[inDir * LEAF_W * 0.5, (GLASS_Y1_OUT + LEAF_H) / 2, 0]}>
        <boxGeometry args={[LEAF_W, LEAF_H - GLASS_Y1_OUT, 0.056]} />
        <WoodMat />
      </mesh>
      {(
        [
          [0.1, 0.2], // стойка у петель
          [LEAF_W - 0.12, 0.24], // стойка у середины
        ] as [number, number][]
      ).map(([cx, w]) => (
        <mesh key={cx} position={[inDir * cx, glassCy, 0]}>
          <boxGeometry args={[w, GLASS_Y1_OUT - GLASS_Y0_OUT, 0.056]} />
          <WoodMat />
        </mesh>
      ))}
      <Handle
        keyX={(side === -1 ? KEY_X : -KEY_X) - hingeX}
        out={side}
        plate={plate}
        lever={lever}
        leverRef={leverRef}
      />
    </group>
  );
}

// Дверь как настоящая: коробка (арочная фрамуга со стеклом) неподвижна, а две створки на петлях по краям проёма
// открываются внутрь зала. Рычажные ручки нажимаются. Стёкла 3D, сквозь них видна комната. Анимация идёт от прогресса скролла.
function Door({ progress }: { progress: MotionValue<number> }) {
  const transom = useKit(asset("/facade/kit/door_transom.webp"));
  const outer = useKit(asset("/facade/kit/door_outer.webp"));
  const inner = useKit(asset("/facade/kit/door_inner.webp"));
  const normal = useKit(
    asset("/facade/kit/door_outer_normal.webp"),
    undefined,
    undefined,
    false,
    false,
  );
  // плашка и рычаг одни на все четыре ручки (раньше каждая ручка клонировала обе текстуры)
  const plate = useKit(asset("/facade/kit/handle_plate.webp"));
  const lever = useKit(asset("/facade/kit/handle_lever.webp"));
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const levers = useRef<{ el: THREE.Group; dl: number }[]>([]);
  const registerLever = (el: THREE.Group | null, dl: number) => {
    if (el && !levers.current.some((l) => l.el === el))
      levers.current.push({ el, dl });
  };
  const transomGlass = useMemo(() => {
    const s = new THREE.Shape();
    const r = 0.97;
    const y = DOOR_YT + 0.1;
    s.moveTo(-r, y);
    s.absarc(0, y, r, Math.PI, 0, true);
    s.lineTo(-r, y);
    return new THREE.ShapeGeometry(s, 32);
  }, []);

  // арка-рама толщиной 0.1 м с фаской: даёт объём и боковые грани фрамуге
  const transomFrame = useMemo(() => {
    const r = DOOR_W / 2;
    const ri = 0.93;
    const y = DOOR_YT + 0.1;
    const s = new THREE.Shape();
    s.moveTo(-r, y);
    s.absarc(0, y, r, Math.PI, 0, true);
    s.lineTo(ri, y);
    s.absarc(0, y, ri, 0, Math.PI, false);
    s.lineTo(-r, y);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.01,
      bevelSegments: 1,
      curveSegments: 32,
    });
    g.translate(0, 0, -0.04);
    return g;
  }, []);

  // progress — позиция u. Створки открываются в первой половине перехода 0 → 1 и закрываются после выхода (u 4 → 5).
  // Ручка: нажата (doorHandle) до открывания, держится, пока створки трогаются с места, и отпускается, когда они разошлись.
  useFrame(() => {
    const u = progress.get();
    const open = smooth((u - 0.05) / 0.5);
    const close = u > 4 ? smooth((u - 4.5) / 0.4) : 0;
    const a = open * (1 - close) * 1.7;
    if (left.current) left.current.rotation.y = a;
    if (right.current) right.current.rotation.y = -a;
    // при закрывании в конце выхода ручка нажимается ещё раз (защёлка)
    const latch =
      smooth((close - 0.55) / 0.25) * (1 - smooth((close - 0.96) / 0.04));
    const pressed = Math.min(
      1,
      doorHandle.get() * (1 - smooth((u - 0.2) / 0.22)) + latch,
    );
    for (const { el, dl } of levers.current)
      el.rotation.z = -dl * 0.5 * pressed;
  });

  return (
    <group>
      {/* неподвижная фрамуга: объёмная рама-арка, две плоскости с переплётом (параллакс), стекло между ними */}
      <mesh geometry={transomFrame} castShadow receiveShadow>
        <WoodMat />
      </mesh>
      <mesh position={[0, DOOR_YT + 0.05, 0]} castShadow>
        <boxGeometry args={[DOOR_W, 0.1, 0.1]} />
        <WoodMat />
      </mesh>
      {([1, -1] as const).map((side) => (
        <mesh key={side} position={[0, DOOR_YT + 0.6, 0.058 * side]}>
          <planeGeometry args={[DOOR_W, 1.2]} />
          <meshStandardMaterial
            map={transom}
            bumpMap={transom}
            bumpScale={1.2}
            emissiveMap={transom}
            emissive="#ffffff"
            emissiveIntensity={0.06}
            color="#a89a94"
            roughness={0.5}
            transparent
            alphaTest={0.5}
            side={side === 1 ? THREE.FrontSide : THREE.BackSide}
          />
        </mesh>
      ))}
      <mesh geometry={transomGlass} position={[0, 0, 0]} renderOrder={2}>
        <meshPhysicalMaterial
          color="#dfeaf2"
          transparent
          opacity={0.1}
          roughness={0.03}
          clearcoat={1}
          envMapIntensity={1.6}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Leaf
        side={-1}
        outer={outer}
        inner={inner}
        normal={normal}
        plate={plate}
        lever={lever}
        groupRef={left}
        leverRef={registerLever}
      />
      <Leaf
        side={1}
        outer={outer}
        inner={inner}
        normal={normal}
        plate={plate}
        lever={lever}
        groupRef={right}
        leverRef={registerLever}
      />
    </group>
  );
}

// Улица: плиты тротуара, бордюр и асфальт — из сгенерированных текстур
function Street() {
  const walkTex = useKit(asset("/facade/kit/sidewalk.webp"), [90 / 2.4, 4.6 / 2.4]);
  const roadTex = useKit(asset("/facade/kit/asphalt.webp"), [90 / 6, 56 / 6]);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.005, 2.3]}
        receiveShadow
      >
        <planeGeometry args={[90, 4.6]} />
        <meshStandardMaterial
          map={walkTex}
          emissiveMap={walkTex}
          emissive="#ffffff"
          emissiveIntensity={0.18}
          color="#aeb0b8"
          roughness={0.9}
        />
      </mesh>
      <mesh position={[0, 0.0, 4.65]} receiveShadow>
        <boxGeometry args={[90, 0.16, 0.22]} />
        <meshStandardMaterial color="#8d8a85" roughness={0.6} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.12, 33]}
        receiveShadow
      >
        <planeGeometry args={[90, 56]} />
        <meshStandardMaterial map={roadTex} color="#8a8c94" roughness={0.9} />
      </mesh>
    </group>
  );
}

// Колонны на стыках центрального кадра и боковых пролётов: общий компонент StoneColumn (тот же, что и в зале).
// Диаметр ствола с запасом перекрывает шов, верх капители у верхней кромки кадра.
const FC_D = 0.9;
const FC_TOP = HERO_H - 0.1;
const FC_Z = Z + 0.3; // ось колонны: ствол наполовину выступает из стены

function FacadeColumns() {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => applyMist(ref.current, "columns"), []);
  return (
    <group ref={ref}>
      {[-1, 1].map((s) => (
        // правая колонна зеркальна левой: свет в картинках падает справа, а лампы и боковой свет — со стороны двери
        <group key={s} position={[s * SIDE_X0, 0, FC_Z]} scale={[s, 1, 1]}>
          <StoneColumn d={FC_D} top={FC_TOP} tint={DUSK} glow={0.1} />
          {/* боковой свет со стороны двери: с одной стороны ствол светлее, с другой темнее, и колонна читается круглой */}
          <pointLight
            position={[1.4, 3.2, 1.6]}
            intensity={16}
            distance={10}
            decay={2}
            color="#ffe6c8"
          />
        </group>
      ))}
    </group>
  );
}

// Фасад грузится четырьмя шагами (см. Room), от ближнего к дальнему: улица (тротуар, бордюр, дорога), фонари, колонны, остальное
// (стена за кадром, боковые пролёты, дверь). Центральный кадр — FacadeHero, он грузится отдельно.
// Шаг 1: улица
export function FacadeStreet() {
  return (
    <group>
      <Street />
    </group>
  );
}

// Шаг 2: фонари (объёмные модели со своим светом)
export function FacadeLanterns() {
  return (
    <group>
      <Lantern cx={LAMP_X[0]} />
      <Lantern cx={LAMP_X[1]} />
    </group>
  );
}

// Шаг 3: колонны (со своим боковым светом)
export { FacadeColumns };

// Шаг 4: тёмная стена за кадром, боковые пролёты и дверь
export function FacadeBody({ progress }: { progress: MotionValue<number> }) {
  return (
    <group>
      <BackWall />
      <SideBays />
      <Door progress={progress} />
    </group>
  );
}
