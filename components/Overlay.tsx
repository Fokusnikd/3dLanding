"use client";

import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { museum, profile } from "@/lib/content";
import { reveal } from "@/lib/motion-tokens";
import Button from "./Button";
import { api, focusValue, transition } from "./controls";

type Range = readonly [number, number, number, number];

// Окна видимости подписей по позиции в зале u (0…4, целое число — остановка):
// [появление начинается, полностью видно, начинает гаснуть, исчезло]
export const RANGES = {
  works: [0.5, 0.9, 1.15, 1.6],
  stack: [1.4, 1.85, 2.15, 2.6],
  portfolio: [2.5, 2.9, 3.15, 3.6], // правая стена: «Обо мне» и примеры портфолио
  contact: [3.4, 3.85, 4.1, 4.5], // входная стена изнутри: контакты
  exit: [3.4, 3.85, 4.1, 4.5], // там же: «Спасибо, что заглянули»
} as const satisfies Record<string, Range>;

const OUT = [0, 1, 1, 0];
const OUT_HOLD = [0, 1, 1, 1];
const toPointer = (o: number) => (o > 0.5 ? "auto" : "none");
const dimByFocus = ([b, f]: number[]) => b * (1 - f);
// полностью невидимые блоки не должны перерисовываться каждый кадр вместе с 3D-сценой
const toDisplay = (o: number) => (o < 0.01 ? "none" : "block");

// Плавно показывает/скрывает содержимое по прогрессу и отключает клики, пока оно невидимо
export function Fade({
  progress,
  range,
  hold,
  className,
  children,
}: {
  progress: MotionValue<number>;
  range: Range;
  hold?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const base = useTransform(progress, range as unknown as number[], hold ? OUT_HOLD : OUT);
  // когда камера подлетает к картине (режим «работа на весь экран»), подписи на стенах гаснут
  const opacity = useTransform([base, focusValue], dimByFocus);
  const pointerEvents = useTransform(opacity, toPointer);
  const display = useTransform(opacity, toDisplay);
  return (
    <motion.div className={className} style={{ opacity, pointerEvents, display }}>
      {children}
    </motion.div>
  );
}

const smooth01 = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

// Текст на стене гаснет по мере приближения к двери и при входе. Функция вне компонента: стабильная ссылка.
// Приближение считаем так же, как камера: во время перехода оно плавно гасится от значения на старте.
const introOpacity = ([u, a]: number[]) => {
  const aEff = transition.active ? transition.aStart * (1 - Math.min(1, Math.abs(u - transition.kFrom))) : a;
  return (1 - smooth01(u / 0.25)) * (1 - smooth01(Math.max(0, aEff) / 0.65));
};

// Первый экран: текст «лежит» на стене по сторонам от двери
export function Intro({ progress, approach }: { progress: MotionValue<number>; approach: MotionValue<number> }) {
  const opacity = useTransform([progress, approach], introOpacity);
  const [before, accent] = profile.headline.split("*");
  return (
    <motion.div className="intro" style={{ opacity }}>
      <div className="intro-left">
        <p className="eyebrow">
          {profile.role} · {profile.city}
        </p>
        <h1 className="display intro-title">
          {before}
          <span className="accent">{accent}</span>
        </h1>
      </div>
      <div className="intro-right">
        <p className="lead">{profile.intro}</p>
        <p className="intro-hint">Прокрутите, чтобы войти</p>
      </div>
    </motion.div>
  );
}

const SECTIONS = [
  { label: museum.worksTitle },
  { label: museum.stackTitle },
  { label: museum.portfolioTitle },
  { label: "Контакты" },
];

const STOP_LABELS = ["Вход", ...SECTIONS.map((s) => s.label)];

// Точки справа: где мы и быстрый переход к любой стене
export function Dots({ progress }: { progress: MotionValue<number> }) {
  const [active, setActive] = useState(0);
  useMotionValueEvent(progress, "change", (u) => {
    // во второй половине выхода камера уже развернулась к первому экрану
    const next = u > 4.5 ? 0 : Math.round(u);
    setActive((cur) => (cur === next ? cur : next));
  });
  return (
    <div className="dots">
      {STOP_LABELS.map((label, i) => (
        <button
          key={label}
          type="button"
          className={active === i ? "dot is-active" : "dot"}
          aria-label={label}
          aria-current={active === i ? "step" : undefined}
          onClick={() => api.goTo(i)}
        />
      ))}
    </div>
  );
}

// Подпись текущего места внизу экрана
export function Hud({ progress }: { progress: MotionValue<number> }) {
  const [idx, setIdx] = useState(-1);
  useMotionValueEvent(progress, "change", (u) => {
    // в конце выхода подпись убираем: мы снова у первого экрана
    const next = u > 4.5 ? -1 : Math.round(u) - 1;
    setIdx((cur) => (cur === next ? cur : next));
  });
  return (
    <div className="hud" aria-live="polite">
      <AnimatePresence mode="wait">
        {idx >= 0 && (
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={reveal}
          >
            <span>{String(idx + 1).padStart(2, "0")}</span> {SECTIONS[idx].label}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// Табличка рядом с картиной
export function Plaque({ title, sub, progress, range }: { title: string; sub: string; progress: MotionValue<number>; range: Range }) {
  return (
    <Fade progress={progress} range={range}>
      {/* «в воздухе» без плашки: крупное название, тонкая золотая линия с ромбом и мелкая строка капителью */}
      <div className="plaque">
        <strong className="display">{title}</strong>
        <i className="plaque-rule" aria-hidden />
        <span>{sub}</span>
      </div>
    </Fade>
  );
}

// Заголовок зала на стене: не табличка, а «золотые буквы по стене» с номером зала над ними и линией с ромбом под ними
export function WallTitle({ text, num, progress, range }: { text: string; num: string; progress: MotionValue<number>; range: Range }) {
  return (
    <Fade progress={progress} range={range}>
      <div className="hall-title">
        <p className="hall-num">
          <i aria-hidden />
          <span>Зал {num}</span>
          <i aria-hidden />
        </p>
        <h2 className="display hall-name">{text}</h2>
        <i className="hall-rule" aria-hidden />
      </div>
    </Fade>
  );
}

// Входная стена изнутри: контакты, ссылки на ресурсы и CV
export function ContactBoard({ progress }: { progress: MotionValue<number> }) {
  return (
    <Fade progress={progress} range={RANGES.contact}>
      <div className="board contact-board">
        <p className="eyebrow">Контакты</p>
        <h2 className="display wall-title">{museum.contactTitle}</h2>
        <a className="contact-mail display" href={`mailto:${profile.email}`}>
          {profile.email}
        </a>
        <div className="contact-row">
          <Button href={`mailto:${profile.email}`}>Написать мне</Button>
          <Button href={profile.cv.href} variant="ghost" external>
            {profile.cv.label} ↓
          </Button>
        </div>
        <ul className="socials">
          {profile.socials.map((s) => (
            <li key={s.label}>
              <a href={s.href} target="_blank" rel="noreferrer">
                {s.label} <span aria-hidden>↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Fade>
  );
}

// Входная стена изнутри: выход через открытую дверь
export function ExitBoard({ progress }: { progress: MotionValue<number> }) {
  return (
    <Fade progress={progress} range={RANGES.exit}>
      <div className="exit-board">
        <h2 className="display wall-title">{museum.exitTitle}</h2>
        <p className="intro-hint">{museum.exitHint}</p>
      </div>
    </Fade>
  );
}
