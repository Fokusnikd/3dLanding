"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { Showcase } from "@/lib/content";

type Props = {
  group: Showcase;
  position: { current: number; total: number };
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
};

// Внутри группы примеров портфолио: окно со своим скроллом, как у места работы.
// Первый экран — картина и название, ниже карточки со ссылками на проекты.
export default function ShowcasePage({ group, position, onClose, onPrev, onNext }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <motion.div
      className="case"
      role="dialog"
      aria-modal="true"
      aria-label={group.title}
      // содержимое проявляется, когда камера уже подлетела к картине
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.6, delay: 0.9 } }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <div className="case-bar">
        <p className="case-count">
          <span>{String(position.current).padStart(2, "0")}</span> / {String(position.total).padStart(2, "0")}
        </p>
        <div className="case-actions">
          <button type="button" className="icon-btn" onClick={onPrev} disabled={!onPrev} aria-label="Предыдущая группа">
            ←
          </button>
          <button type="button" className="icon-btn" onClick={onNext} disabled={!onNext} aria-label="Следующая группа">
            →
          </button>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
      </div>

      <section className="group">
        <div className="group-head">
          <p className="eyebrow">{group.kicker}</p>
          <h2 className="display">{group.title}</h2>
          <p className="group-lead">{group.blurb}</p>
        </div>
        <p className="scroll-hint" aria-hidden>
          Листайте вниз <span>↓</span>
        </p>
      </section>

      <div className="job-body">
        <div className="job-inner">
          <section aria-labelledby={`${group.id}-items`}>
            <h3 id={`${group.id}-items`} className="job-heading">
              Проекты
            </h3>
            <ul className="link-grid">
              {group.items.map((item) => {
                const body = (
                  <>
                    <strong className="display">{item.title}</strong>
                    <span className="link-card-blurb">{item.blurb}</span>
                    <span className="link-card-tags">{item.tags.join(" · ")}</span>
                    <span className="link-card-cta">
                      {item.href ? (
                        <>
                          {group.linkLabel} <span aria-hidden>↗</span>
                        </>
                      ) : (
                        "Ссылка скоро появится"
                      )}
                    </span>
                  </>
                );
                return (
                  <li key={item.title}>
                    {item.href ? (
                      <a className="link-card" href={item.href} target="_blank" rel="noreferrer">
                        {body}
                      </a>
                    ) : (
                      <div className="link-card is-empty">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
