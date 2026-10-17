"use client";

import { useEffect, useState } from "react";
import { animate, motionValue, useSpring } from "motion/react";

// Остановки: 0 — стена с дверью · 1 — стена с местами работы · 2 — левая стена (инструментарий) ·
// 3 — правая стена («Обо мне» и примеры портфолио) · 4 — разворот к двери (контакты и выход)
export const STOPS = 5;

// Сколько шагов поэтапной загрузки зала (см. Room): каждый грузится после предыдущего и показывается, когда готов.
// 1 улица · 2 фонари · 3 колонны · 4 стена и дверь фасада · 5 пол, потолок и стены зала · 6 каркас зала ·
// 7 картины · 8 «Инструментарий» · 9 статуи и эмблемы
export const LOAD_STEPS = 9;

// ═════════════ НАСТРОЙКИ ДВИЖЕНИЯ — подкручивайте здесь ═════════════

// Вход через дверь (переход 0 → 1 и обратно).
export const ENTRY_DURATION = 2.6; // секунды: меньше — быстрее
// Кривая скорости cubic-bezier [x1, y1, x2, y2]. [0, 0, 1, 1] — ровная скорость, как у приближения скроллом.
// Чем сильнее точки уходят от диагонали, тем «плавнее» разгон и торможение.
export const ENTRY_EASE: [number, number, number, number] = [0.3, 0.15, 0.6, 1];
// Перед входом камера стоит на месте, пока нажимается ручка двери (секунды). 0 — без паузы.
export const DOOR_HANDLE_TIME = 0.5;
// Сколько секунд ручка отпускается после возврата к первому экрану (щелчок замка)
export const DOOR_HANDLE_RELEASE = 0.6;

// Каждый «жест» прокрутки (щелчок колеса, взмах тачпада, свайп, клавиша) — ровно один шаг к следующей точке.
// Точки: дверь → стена с работами → левая картина → центральная → правая → левая стена → правая стена → выход.
// Внутри стены с работами (остановка 1) — три промежуточных шага к картинам, на остальных остановках шагов нет.
const WALL_STEPS = 3;
const GESTURE_GAP_MS = 140; // пауза в прокрутке, после которой жест считается новым (гасит инерцию тачпада)
const SWIPE_PX = 36; // сколько пальцу надо пройти, чтобы засчитать свайп

// ═══════════════════════════════════════════════════════════════════

const COOLDOWN_MS = 450; // пауза после перехода: гасит инерцию тачпада
// длительность перехода k → k+1 (и обратно), секунды; последний — выход через дверь с разворотом
const DURATIONS = [3.6, 2.4, 3.2, 2.4, 4.4];
// Быстрый старт и плавное торможение: переход подхватывает движение приближения, без «мёртвой» паузы
const EASE: [number, number, number, number] = [0.45, 0, 0.2, 1];

// Позиция в зале: целое число — остановка, дробное — идёт переход
export const uValue = motionValue(0);
// Нажатие ручки двери: 0 — отпущена, 1 — нажата. Растёт перед входом, пока камера стоит на месте.
export const doorHandle = motionValue(0);
// Целевое приближение (+) или отдаление (−) внутри остановки, −1…1. На ±1 запускается переход.
export const approachTarget = motionValue(0);
// Данные о текущем переходе для камеры
export const transition = { active: false, kFrom: 0, aStart: 0 };
// Прыжок к остановке (навигация, точки справа)
export const api: { goTo: (i: number) => void } = { goTo: () => {} };

// Режим «работа на весь экран»: 0 — обычный зал, 1 — камера прямо перед картиной
export const focusValue = motionValue(0);
// Где стоит камера перед выбранной картиной. Значения анимируются при листании соседних работ.
export const focusPose = {
  x: motionValue(0),
  y: motionValue(2.6), // высота центра картины: у картин правой стены она разная
  z: motionValue(0),
  yaw: motionValue(0),
  contain: motionValue(0), // 1 — вписать раму в экран целиком (щиток), 0 — закрыть ею экран (картины)
  w: motionValue(1), // размеры картины: от них зависит, как близко подъехать, чтобы она заполнила экран
  h: motionValue(1),
};

// Дверца электрощитка: 0 — закрыта, 1 — распахнута (внутри видна статистика). Открывается, когда камера подлетела к щитку.
export const panelDoor = motionValue(0);

// Режим «рассматривать статую»: 0 — обычный зал, 1 — камера стоит перед статуей лицом к ней.
// Клик по статуе вызывает statueApi.open (его подставляет Scene), позу камеры задаёт сама статуя.
export const statueFocus = motionValue(0);
// Поза камеры перед статуей (x, y, z, yaw) и точка, на которую она смотрит (tx, tz — центр статуи на полу).
export const statuePose = {
  x: motionValue(0),
  y: motionValue(1.7),
  z: motionValue(0),
  yaw: motionValue(0), // как у yaw камеры: 0 — смотрит в −z
  tx: motionValue(0),
  tz: motionValue(0),
};
// Облёт камеры вокруг статуи: az — поворот вокруг неё (рад), el — подъём камеры (м), zoom — множитель расстояния.
// t* — то, куда тянет пользователь (перетаскивание, колесо); az / el / zoom камера догоняет плавно.
export const statueOrbit = { az: 0, el: 0, zoom: 1, taz: 0, tel: 0, tzoom: 1 };
export const statueCurrent = { id: null as string | null };
export type StatueCamPose = { id: string; x: number; y: number; z: number; yaw: number; tx: number; tz: number };
export const statueApi: { open: (p: StatueCamPose) => void; close: () => void } = { open: () => {}, close: () => {} };

const state = { k: 0, busy: false, lockUntil: 0, paused: false, calm: false };

// Виртуальный скролл: колесо, тачпад, свайп и клавиши двигают сцену, а не страницу
export function useMuseumControls(paused: boolean, calm: boolean) {
  // сглаженное приближение: камера «подплывает», а не дёргается за колесом
  const a = useSpring(approachTarget, calm ? { stiffness: 1000, damping: 100 } : { stiffness: 70, damping: 17, mass: 1 });
  const [stop, setStop] = useState(0);

  useEffect(() => {
    state.paused = paused;
    state.calm = calm;
  }, [paused, calm]);

  useEffect(() => {
    let running: ReturnType<typeof animate> | null = null;

    const run = (to: number) => {
      // to === STOPS — «выход»: проезд сквозь дверь и возврат к первому экрану
      if (state.busy || to === state.k || to < 0 || to > STOPS) return;
      state.busy = true;
      transition.active = true;
      transition.kFrom = state.k;
      transition.aStart = a.get();
      a.jump(0);
      approachTarget.set(0);

      const dir = to > state.k ? 1 : -1;
      let total = 0;
      for (let s = state.k; s !== to; s += dir) total += DURATIONS[Math.min(s, s + dir)];
      const steps = Math.abs(to - state.k);
      // вход через дверь (0 ↔ 1) идёт по отдельным настройкам ENTRY_*
      const isEntry = steps === 1 && Math.min(state.k, to) === 0 && to <= 1;
      const duration = state.calm
        ? 0.01
        : isEntry
          ? ENTRY_DURATION
          : Math.max(2.2, steps > 1 ? total * 0.6 : total);

      const start = () => {
        running = animate(uValue, to, {
          duration,
          ease: isEntry ? ENTRY_EASE : EASE,
          onComplete: () => {
            // после выхода поза камеры совпадает с первым экраном: «перематываем» на начало без шва
            const end = to === STOPS ? 0 : to;
            if (to === STOPS) {
              uValue.set(0);
              doorHandle.set(0); // дверь закрыта, ручка отпущена
            } else if (end === 0) {
              animate(doorHandle, 0, { duration: DOOR_HANDLE_RELEASE, ease: "easeOut" }); // вернулись к двери: ручка отпускается
            }
            state.k = end;
            state.busy = false;
            state.lockUntil = performance.now() + COOLDOWN_MS;
            transition.active = false;
            setStop(end);
          },
        });
      };

      if (state.k === 0 && to > 0) {
        // от двери вперёд: ручка нажимается сразу, одновременно с началом движения камеры (без паузы перед входом)
        if (isEntry && !state.calm && DOOR_HANDLE_TIME > 0) {
          animate(doorHandle, 1, { duration: DOOR_HANDLE_TIME, ease: [0.4, 0, 0.2, 1] });
        } else {
          doorHandle.set(1);
        }
        start();
      } else {
        start();
      }
    };
    api.goTo = run;

    // dir > 0 — «вперёд» (скролл вниз), dir < 0 — «назад». Один вызов — один шаг к соседней точке.
    const push = (dir: 1 | -1) => {
      if (state.paused || state.busy || performance.now() < state.lockUntil) return;
      const s = Math.round(approachTarget.get());
      if (state.k === 1 && dir > 0 && s < WALL_STEPS) approachTarget.set(s + 1); // к следующей картине
      else if (state.k === 1 && dir < 0 && s > 0) approachTarget.set(s - 1); // к предыдущей картине
      else if (dir > 0) run(state.k + 1); // с последней остановки это выход к началу
      else if (state.k > 0) run(state.k - 1);
    };

    // Жест: пока колесо не замолчало на GESTURE_GAP_MS, он засчитывается один раз — инерция не делает лишних шагов
    let lastWheel = 0;
    let gestureUsed = false;
    const onWheel = (e: WheelEvent) => {
      if (state.paused) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel > GESTURE_GAP_MS) gestureUsed = false;
      lastWheel = now;
      if (gestureUsed || Math.abs(e.deltaY) < 2) return;
      gestureUsed = true;
      push(e.deltaY > 0 ? 1 : -1);
    };

    let touchY = 0;
    let swiped = false;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY;
      swiped = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (state.paused) return;
      e.preventDefault();
      const d = touchY - e.touches[0].clientY;
      if (swiped || Math.abs(d) < SWIPE_PX) return;
      swiped = true;
      push(d > 0 ? 1 : -1);
    };

    const onKey = (e: KeyboardEvent) => {
      if (state.paused) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        push(1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        push(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        run(0);
      } else if (e.key === "End") {
        e.preventDefault();
        run(STOPS - 1);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      running?.stop();
      api.goTo = () => {};
    };
  }, [a]);

  return { a, stop };
}
