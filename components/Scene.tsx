"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { AnimatePresence, animate, type MotionValue } from "motion/react";
import * as THREE from "three";
import { entries, profile } from "@/lib/content";
import {
  DEPTH,
  FRAMES,
  HALF_W,
  RIGHT_PORTFOLIO_Z,
  RIGHT_STATUE_Z,
  SK,
  SZ,
  WALL_STOP,
  artCenter,
  type FrameDef,
} from "@/lib/gallery";
import Room from "./Room";
import LoadingBar from "./LoadingBar";
import MistLayer, { MIST_BACKGROUND, MIST_FOG_ARGS } from "./MistLayer";
import DebugStats from "./DebugStats";
import { Dots, Hud, Intro } from "./Overlay";
import JobPage from "./JobPage";
import ShowcasePage from "./ShowcasePage";
import { PanelHud } from "./PanelScreen";
import {
  focusPose,
  focusValue,
  panelDoor,
  statueApi,
  statueCurrent,
  statueFocus,
  statueOrbit,
  statuePose,
  transition,
  uValue,
  useMuseumControls,
  type StatueCamPose,
} from "./controls";

const HALF_PI = Math.PI / 2;
const EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];

// Остановки камеры (yaw > 0 — поворот налево):
// 0 стена с дверью · 1 стена с местами работы (после входа) · 2 левая стена (инструментарий) ·
// 3 правая стена («Обо мне», примеры портфолио) · 4 разворот к двери: контакты и выход.
// После остановки 4 идёт «выход»: камера проходит в дверь, разворачивается и возвращается к остановке 0.
// Расстояния до стен выросли вместе с залом (SK), поэтому камера стоит и подъезжает пропорционально дальше.
const STOPS = [
  { x: 0, z: 14, yaw: 0 },
  { x: 0, z: -DEPTH + 8.2 * SK, yaw: 0 },
  { x: -HALF_W + 7.0 * SK, z: -6.2 * SZ, yaw: HALF_PI },
  { x: HALF_W - 6.6 * SK, z: RIGHT_PORTFOLIO_Z, yaw: HALF_PI * 3 }, // напротив середины группы «Примеры портфолио»
  { x: 0, z: -9.2 * SK, yaw: Math.PI },
];
const EYE = 1.7;
// насколько камера подъезжает к стене при полном «приближении» и отъезжает при «отдалении»
const APPROACH = [6.5, 3.4 * SK, 2.6 * SK, 2.6 * SK, 1.6 * SK];
const PULL = [0, 1.2 * SK, 1.0 * SK, 1.2 * SK, 1.5 * SK];

// Приближение ускоряется к порогу: сначала разгон, потом рывок вперёд, как в самом переходе
const shape = (a: number) => Math.sign(a) * Math.pow(Math.abs(a), 1.4);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth01 = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

// ═════════ НАСТРОЙКИ ПРИБЛИЖЕНИЯ К КАРТИНАМ НА СТЕНЕ — подкручивайте здесь ═════════
const STAGE_DISTANCE = 3.8 * SK; // метров от стены, на которых камера «смотрит поближе» на картину
const STAGE_SHIFT = 0.75; // насколько камера смещается к картине по ширине (1 — встать точно напротив, 0 — не двигаться)
// ══════════════════════════════════════════════════════════════════════════════════

// Поза камеры у картины на стене с работами
function framePose(frameIdx: number) {
  const f = FRAMES[frameIdx];
  const x = f.position[0] * STAGE_SHIFT;
  const z = f.position[2] + STAGE_DISTANCE;
  const yaw = Math.atan2(-(f.position[0] - x), -(f.position[2] - z)); // камера повёрнута лицом к картине
  return { x, z, yaw };
}

// На сколько камера отклоняется от позы остановки k при приближении a.
// Обычная остановка: a от −1 (отдалились) до 1 (приблизились) — движение вдоль взгляда.
// Стена с работами (k = 1): a от 0 до 3 — по очереди левая картина, центральная, правая.
function stageOffset(k: number, a: number) {
  if (k === 1 && a > 0) {
    const base = STOPS[1];
    const keys = [base, framePose(0), framePose(1), framePose(2)];
    const aa = Math.min(a, keys.length - 1);
    const i = Math.min(keys.length - 2, Math.floor(aa));
    const f = aa - i;
    // первый шаг (к левой картине) — такой же разгон, как у обычного приближения; между картинами — плавный проезд
    const e = i === 0 ? shape(f) : smooth01(f);
    return {
      dx: lerp(keys[i].x, keys[i + 1].x, e) - base.x,
      dz: lerp(keys[i].z, keys[i + 1].z, e) - base.z,
      dyaw: lerp(keys[i].yaw, keys[i + 1].yaw, e) - base.yaw,
    };
  }
  const yawK = STOPS[k].yaw;
  const s = shape(a);
  const dist = s >= 0 ? s * APPROACH[k] : s * PULL[k];
  return { dx: -Math.sin(yawK) * dist, dz: -Math.cos(yawK) * dist, dyaw: 0 };
}

// Базовая поза камеры по позиции u.
// u от 0 до 4 — остановки и переходы между ними, u от 4 до 5 — выход через дверь к первому экрану.
function pose(u: number) {
  const last = STOPS.length - 1;
  let x: number;
  let z: number;
  let yaw: number;
  let pulse = 0;

  if (u > last) {
    // выход: сначала идём сквозь дверь на улицу лицом наружу, затем разворачиваемся к стене
    const f = Math.min(1, u - last);
    const walk = smooth01(f / 0.62);
    const turn = smooth01((f - 0.55) / 0.45);
    z = lerp(lerp(STOPS[last].z, 17, walk), STOPS[0].z, turn);
    x = lerp(STOPS[last].x, STOPS[0].x, turn);
    yaw = Math.PI + Math.PI * turn; // π → 2π: тот же взгляд, что и yaw 0 на первом экране
    pulse = Math.sin(Math.PI * turn);
  } else {
    const i = Math.min(last - 1, Math.max(0, Math.floor(u)));
    const f = Math.min(1, Math.max(0, u - i));
    const A = STOPS[i];
    const B = STOPS[i + 1];
    x = lerp(A.x, B.x, f);
    z = lerp(A.z, B.z, f);
    yaw = lerp(A.yaw, B.yaw, f);

    // дуга: во время поворотов камера чуть отъезжает назад, как оператор на тележке
    if (i >= 1) {
      const s = Math.sin(Math.PI * f);
      const mid = (A.yaw + B.yaw) / 2;
      x += Math.sin(mid) * s * 0.9;
      z += Math.cos(mid) * s * 0.9;
      pulse = s;
    }
  }

  return { x, z, yaw, pulse };
}

function Rig({ a, calm }: { a: MotionValue<number>; calm: boolean }) {
  // Курсор берём с окна, а не из R3F: R3F перестаёт его обновлять над HTML-элементами
  // (навигация, точки, таблички), а потом камера резко «догоняет» — отсюда дёрганье.
  const target = useRef({ x: 0, y: 0 });
  // сглаженное значение: камера следует за курсором с инерцией
  const look = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      target.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useFrame((state, dt) => {
    const { camera, size } = state;
    const u = uValue.get();
    const cam = camera as THREE.PerspectiveCamera;

    // Отклонение камеры от позы остановки из-за приближения. Во время перехода оно плавно гасится:
    // стартуем из позы, где остановился скролл, и к моменту прибытия отклонение равно нулю.
    let off: { dx: number; dz: number; dyaw: number };
    let fovA: number; // приближение для эффекта «втягивания» (−1…1)
    if (transition.active) {
      const w = 1 - Math.min(1, Math.abs(u - transition.kFrom));
      const o = stageOffset(transition.kFrom, transition.aStart);
      off = { dx: o.dx * w, dz: o.dz * w, dyaw: o.dyaw * w };
      fovA = Math.max(-1, Math.min(1, transition.aStart)) * w;
    } else {
      const k = Math.min(STOPS.length - 1, Math.round(u));
      const av = a.get();
      off = stageOffset(k, av);
      fovA = Math.max(-1, Math.min(1, av));
    }
    const p = pose(u);

    // угол обзора: на узких экранах шире, а в середине поворота слегка «вдыхает»
    const aspect = size.width / size.height;
    const base =
      aspect < 1.2 ? Math.min(85, 45 * Math.pow(1.2 / aspect, 0.7)) : 45;
    // эффект «втягивания»: при приближении угол обзора сужается, при отдалении — слегка расширяется
    const sh = shape(fovA);
    const fov = base + p.pulse * 5 - (sh >= 0 ? sh * 11 : sh * 5);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    let x = p.x + off.dx;
    let y = EYE;
    let z = p.z + off.dz;
    let yaw = p.yaw + off.dyaw;

    // «работа на весь экран»: камера подлетает строго перед картиной и подъезжает так, чтобы она закрыла экран
    const focus = focusValue.get();
    if (focus > 0.0001) {
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
      const w = focusPose.w.get();
      const h = focusPose.h.get();
      const byH = h / 2 / tanHalf;
      const byW = w / 2 / (tanHalf * aspect);
      // «cover»: картина заполняет экран целиком; «contain» (щиток): рама целиком помещается в кадр
      const dist = focusPose.contain.get() > 0.5 ? Math.max(byH, byW) : Math.min(byH, byW);
      const fy = focusPose.yaw.get();
      const fx = focusPose.x.get() + Math.sin(fy) * dist;
      const fz = focusPose.z.get() + Math.cos(fy) * dist;
      x = lerp(x, fx, focus);
      y = lerp(y, focusPose.y.get(), focus);
      z = lerp(z, fz, focus);
      // по кратчайшей дуге: у правой стены yaw камеры 3π/2, а у рамы −π/2, и обычный lerp крутил бы камеру на целый оборот
      yaw += (THREE.MathUtils.euclideanModulo(fy - yaw + Math.PI, Math.PI * 2) - Math.PI) * focus;
    }

    // «рассматриваем статую»: камера подходит к позе перед ней и может облетать её (перетаскивание, колесо).
    // Угол берём по кратчайшей дуге, чтобы камера не крутилась вокруг своей оси.
    let pitch = 0;
    const sf = statueFocus.get();
    if (sf > 0.0001) {
      const o = statueOrbit;
      o.zoom = THREE.MathUtils.damp(o.zoom, o.tzoom, 6, dt);
      const tx = statuePose.tx.get();
      const tz = statuePose.tz.get();
      const bx = statuePose.x.get();
      const bz = statuePose.z.get();
      // базовое направление «от статуи к камере»; расстояние с учётом приближения колесом
      const ang0 = Math.atan2(bx - tx, bz - tz);
      const d = Math.hypot(bx - tx, bz - tz) * o.zoom;
      // Облёт идёт по дуге того же радиуса, поэтому угол ограничиваем теми положениями, где камера ещё внутри зала
      // (статуи стоят у стен: за спину обойти нельзя). Иначе камера «подтягивалась» бы к статуе.
      const inside = (az: number) => {
        const qx = tx + Math.sin(ang0 + az) * d;
        const qz = tz + Math.cos(ang0 + az) * d;
        return Math.abs(qx) <= HALF_W - 0.6 && qz <= -0.5 && qz >= -DEPTH + 0.6;
      };
      let hi = 0;
      while (hi < 1.75 && inside(hi + 0.04)) hi += 0.04;
      let lo = 0;
      while (lo > -1.75 && inside(lo - 0.04)) lo -= 0.04;
      o.taz = THREE.MathUtils.clamp(o.taz, lo, hi);
      o.az = THREE.MathUtils.clamp(
        THREE.MathUtils.damp(o.az, o.taz, 6, dt),
        lo,
        hi,
      );
      o.el = THREE.MathUtils.damp(o.el, o.tel, 6, dt);
      const ang = ang0 + o.az;
      const px = tx + Math.sin(ang) * d;
      const pz = tz + Math.cos(ang) * d;
      const py = statuePose.y.get() + o.el;
      const sy = Math.atan2(px - tx, pz - tz); // камера смотрит на статую
      const dyaw =
        THREE.MathUtils.euclideanModulo(sy - yaw + Math.PI, Math.PI * 2) -
        Math.PI;
      pitch = -Math.atan2(o.el, Math.hypot(px - tx, pz - tz)) * sf;
      x = lerp(x, px, sf);
      y = lerp(y, py, sf);
      z = lerp(z, pz, sf);
      yaw = yaw + dyaw * sf;
    }
    camera.position.set(x, y, z);

    // мягкий параллакс от курсора: ощущение глубины. Не во время перехода, не в режиме работы и не при reduced-motion.
    const still = calm || transition.active || focus > 0.0001 || sf > 0.0001;
    look.current.x = THREE.MathUtils.damp(
      look.current.x,
      still ? 0 : target.current.x,
      2.5,
      dt,
    );
    look.current.y = THREE.MathUtils.damp(
      look.current.y,
      still ? 0 : target.current.y,
      2.5,
      dt,
    );
    camera.rotation.set(
      pitch + look.current.y * 0.012,
      yaw - look.current.x * 0.02,
      0,
      "YXZ",
    );
  });
  return null;
}

// Положение камеры перед картиной (мгновенно или с анимацией при листании)
function aimAt(frame: FrameDef, animated: boolean) {
  const c = artCenter(frame);
  const targets: [typeof focusPose.x, number][] = [
    [focusPose.x, c[0]],
    [focusPose.y, c[1]],
    [focusPose.z, c[2]],
    [focusPose.yaw, frame.rotY],
    [focusPose.w, frame.w],
    [focusPose.h, frame.h],
    [focusPose.contain, frame.fit === "contain" ? 1 : 0],
  ];
  // Правая стена: между «Лендингами» и «Дизайном» стоит статуя. Если ехать по прямой вдоль стены, камера пройдёт сквозь неё,
  // поэтому по пути отводим её от стены к центру зала.
  const crossesStatue = animated && frame.wall === "right" && (focusPose.z.get() - RIGHT_STATUE_Z) * (c[2] - RIGHT_STATUE_Z) < 0;
  for (const [mv, value] of targets) {
    if (!animated) mv.set(value);
    else if (crossesStatue && mv === focusPose.x) animate(mv, [mv.get(), HALF_W - 5.2, value], { duration: 1.3, ease: EASE });
    else animate(mv, value, { duration: 1.3, ease: EASE });
  }
}

// Рама картины по сквозному индексу (индекс совпадает с положением в FRAMES)
const wallFrame = (index: number) => FRAMES[index];

export default function Scene() {
  const [status, setStatus] = useState<"pending" | "ok" | "none">("pending");
  const [calm, setCalm] = useState(false);
  const [caseIndex, setCaseIndex] = useState<number | null>(null); // какая картина открыта (сквозной индекс в entries)
  const [caseOpen, setCaseOpen] = useState(false); // показан ли список проектов группы
  const closing = useRef(false);
  const [statueOpen, setStatueOpen] = useState(false); // рассматриваем статую
  const statueClosing = useRef(false);

  // пока работа открыта или рассматривается статуя, скролл сцене не отдаём
  const { a } = useMuseumControls(caseIndex !== null || statueOpen, calm);

  const [loaded, setLoaded] = useState(0); // сколько этапов загрузки зала готово (0…3)

  const [statueHinted, setStatueHinted] = useState(false); // пользователь уже покрутил статую: подсказку убираем

  // клик по статуе: камера плавно подходит к ней; «Назад» или Esc возвращают к залу
  useEffect(() => {
    const resetOrbit = () => {
      statueOrbit.taz = 0;
      statueOrbit.tel = 0;
      statueOrbit.tzoom = 1;
    };
    statueApi.open = (p: StatueCamPose) => {
      if (
        transition.active ||
        focusValue.get() > 0.0001 ||
        statueClosing.current
      )
        return;
      if (statueFocus.get() > 0.0001 && statueCurrent.id === p.id) return; // та же статуя: ничего не делаем
      const dur = calm ? 0.01 : 1.5;
      statueCurrent.id = p.id;
      resetOrbit();
      if (statueFocus.get() > 0.0001) {
        // уже у другой статуи: переезжаем к новой (поворот — по кратчайшей дуге)
        const cur = statuePose.yaw.get();
        const to =
          cur +
          (THREE.MathUtils.euclideanModulo(p.yaw - cur + Math.PI, Math.PI * 2) -
            Math.PI);
        animate(statuePose.x, p.x, { duration: dur, ease: EASE });
        animate(statuePose.y, p.y, { duration: dur, ease: EASE });
        animate(statuePose.z, p.z, { duration: dur, ease: EASE });
        animate(statuePose.yaw, to, { duration: dur, ease: EASE });
        animate(statuePose.tx, p.tx, { duration: dur, ease: EASE });
        animate(statuePose.tz, p.tz, { duration: dur, ease: EASE });
        return;
      }
      statuePose.x.set(p.x);
      statuePose.y.set(p.y);
      statuePose.z.set(p.z);
      statuePose.yaw.set(p.yaw);
      statuePose.tx.set(p.tx);
      statuePose.tz.set(p.tz);
      statueOrbit.az = 0;
      statueOrbit.el = 0;
      statueOrbit.zoom = 1;
      setStatueHinted(false);
      setStatueOpen(true);
      animate(statueFocus, 1, { duration: dur, ease: EASE });
    };
    statueApi.close = () => {
      if (statueFocus.get() < 0.0001 || statueClosing.current) return;
      statueClosing.current = true;
      resetOrbit(); // камера возвращается из облёта вместе с отъездом
      animate(statueFocus, 0, {
        duration: calm ? 0.01 : 1.3,
        ease: EASE,
        onComplete: () => {
          setStatueOpen(false);
          statueCurrent.id = null;
          statueClosing.current = false;
        },
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") statueApi.close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      statueApi.open = () => {};
      statueApi.close = () => {};
    };
  }, [calm]);

  // пока рассматриваем статую: перетаскивание мышью или пальцем облетает камерой вокруг неё, колесо приближает
  useEffect(() => {
    if (!statueOpen) return;
    document.body.classList.add("in-statue");
    const MAX_AZ = 1.75; // ±100°: дальше камера упёрлась бы в стену за статуей
    let down = false;
    let lx = 0;
    let ly = 0;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      down = true;
      lx = e.clientX;
      ly = e.clientY;
      document.body.classList.add("dragging");
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 0) setStatueHinted(true);
      // тянем вправо — статуя поворачивается вправо (камера уходит влево), как если бы её крутили рукой
      statueOrbit.taz = THREE.MathUtils.clamp(
        statueOrbit.taz - dx * 0.006,
        -MAX_AZ,
        MAX_AZ,
      );
      statueOrbit.tel = THREE.MathUtils.clamp(
        statueOrbit.tel + dy * 0.006,
        -0.6,
        1.4,
      );
    };
    const onUp = () => {
      down = false;
      document.body.classList.remove("dragging");
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      statueOrbit.tzoom = THREE.MathUtils.clamp(
        statueOrbit.tzoom * Math.exp(e.deltaY * 0.001),
        0.55,
        1.35,
      );
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.body.classList.remove("in-statue", "dragging");
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("wheel", onWheel);
    };
  }, [statueOpen]);

  useEffect(() => {
    let ok = false;
    try {
      const c = document.createElement("canvas");
      ok = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      ok = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(ok ? "ok" : "none");
    setCalm(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // скрываем навигацию, пока открыт кейс
  useEffect(() => {
    document.body.classList.toggle("in-case", caseIndex !== null);
    return () => document.body.classList.remove("in-case");
  }, [caseIndex]);

  const open = useCallback(
    (index: number) => {
      const frame = FRAMES.find((f) => f.index === index);
      if (
        !frame ||
        caseIndex !== null ||
        transition.active ||
        statueFocus.get() > 0.0001
      )
        return;
      // картину можно открыть, только пока камера стоит у её стены
      if (Math.round(uValue.get()) !== WALL_STOP[frame.wall]) return;
      aimAt(frame, false);
      setCaseIndex(index);
      setCaseOpen(true);
      animate(focusValue, 1, { duration: calm ? 0.01 : 1.5, ease: EASE });
      // электрощиток: камера подлетает, затем дверца распахивается (внутри — статистика)
      if (entries[index].kind === "stats") animate(panelDoor, 1, { duration: calm ? 0.01 : 1.3, delay: calm ? 0 : 1.1, ease: EASE });
    },
    [caseIndex, calm],
  );

  const close = useCallback(() => {
    if (caseIndex === null || closing.current) return;
    closing.current = true;
    setCaseOpen(false);
    // камера отъезжает от картины; если открыт щиток, сначала закрывается его дверца
    const retract = () =>
      animate(focusValue, 0, {
        duration: calm ? 0.01 : 1.3,
        ease: EASE,
        onComplete: () => {
          setCaseIndex(null);
          closing.current = false;
        },
      });
    if (panelDoor.get() > 0.001) animate(panelDoor, 0, { duration: calm ? 0.01 : 0.9, ease: EASE, onComplete: retract });
    else retract();
  }, [caseIndex, calm]);

  // листание внутри своей группы (места работы или примеры портфолио): камера скользит вдоль стены к соседней картине
  const sibling = (i: number, dir: -1 | 1) => {
    const n = i + dir;
    return n >= 0 && n < entries.length && entries[n].kind === entries[i].kind ? n : null;
  };
  const step = useCallback(
    (dir: -1 | 1) => {
      if (caseIndex === null || closing.current) return;
      const next = sibling(caseIndex, dir);
      if (next === null) return;
      aimAt(wallFrame(next), true);
      setCaseIndex(next);
    },
    [caseIndex],
  );
  const prev = caseIndex !== null && sibling(caseIndex, -1) !== null ? () => step(-1) : undefined;
  const next = caseIndex !== null && sibling(caseIndex, 1) !== null ? () => step(1) : undefined;

  if (status === "pending") return null;

  // запасной вариант, если WebGL недоступен
  if (status === "none") {
    return (
      <div className="nogl">
        <h1 className="display">{profile.name}</h1>
        <p>{profile.role}</p>
        <a href={`mailto:${profile.email}`}>{profile.email}</a>
      </div>
    );
  }

  const entry = caseIndex !== null ? entries[caseIndex] : null;
  // номер картины внутри своей группы: места работы и примеры портфолио считаются отдельно
  const position = entry
    ? {
        current: entries.slice(0, caseIndex! + 1).filter((e) => e.kind === entry.kind).length,
        total: entries.filter((e) => e.kind === entry.kind).length,
      }
    : { current: 0, total: 0 };

  return (
    <>
      <div className="scene">
        <Canvas
          shadows
          dpr={[1, 1.6]}
          camera={{ position: [0, EYE, 14], fov: 45, near: 0.1, far: 90 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            // Нужно для фоновой сборки шейдеров (stageLoad.warmUp): по умолчанию three после каждой линковки читает лог программы,
            // и драйвер собирает шейдер синхронно (~70 мс на программу в ANGLE/D3D11). Ошибки шейдеров в консоль не попадут.
            gl.debug.checkShaderErrors = false;
          }}
        >
          <color attach="background" args={[MIST_BACKGROUND]} />
          <fog attach="fog" args={MIST_FOG_ARGS} />
          <hemisphereLight args={["#ffe9cf", "#2a1d16", 0.55]} />
          <ambientLight intensity={0.12} />
          <Environment resolution={128} environmentIntensity={0.45}>
            <Lightformer
              form="rect"
              intensity={6}
              position={[0, 5, -4]}
              scale={[14, 0.6, 1]}
              color="#ffffff"
            />
            <Lightformer
              form="rect"
              intensity={4}
              position={[-7, 1, 1]}
              scale={[0.5, 8, 1]}
              color="#ffd9a8"
            />
          </Environment>
          <Rig a={a} calm={calm} />
          <MistLayer loaded={loaded} />
          <Room progress={uValue} onOpen={open} onStage={setLoaded} />
          <DebugStats />
        </Canvas>
      </div>
      <LoadingBar loaded={loaded} />

      <div className={caseIndex !== null ? "overlay is-focus" : "overlay"}>
        <Intro progress={uValue} approach={a} />
        <Hud progress={uValue} />
        <Dots progress={uValue} />
      </div>

      {statueOpen && (
        <>
          <button
            type="button"
            className="statue-back"
            onClick={() => statueApi.close()}
          >
            <span aria-hidden>←</span> Назад к залу <kbd>Esc</kbd>
          </button>
          {!statueHinted && (
            <div className="statue-hint">
              Потяните, чтобы повернуть · колесо — приблизить
            </div>
          )}
        </>
      )}

      {/* электрощиток: статистика нарисована внутри самого щитка (ElectricPanel), поэтому поверх сцены только кнопка выхода */}
      {caseOpen && entry?.kind === "stats" && <PanelHud onClose={close} />}

      <AnimatePresence mode="wait">
        {caseOpen && entry?.kind === "job" && (
          <JobPage key={entry.job.id} job={entry.job} position={position} onClose={close} onPrev={prev} onNext={next} />
        )}
        {caseOpen && entry?.kind === "showcase" && (
          <ShowcasePage key={entry.group.id} group={entry.group} position={position} onClose={close} onPrev={prev} onNext={next} />
        )}
      </AnimatePresence>
    </>
  );
}
