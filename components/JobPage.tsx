"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { Job } from "@/lib/content";
import { CareerTimeline, MetricCard, ResultCard } from "./JobCharts";

type Props = {
  job: Job;
  position: { current: number; total: number };
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
};

// Внутри места работы: поверх 3D-сцены (за ней — картина, на которую подлетела камера) описание, задачи, результаты и стек
export default function JobPage({ job, position, onClose, onPrev, onNext }: Props) {
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
      aria-label={job.company}
      // описание проявляется, когда камера уже подлетела к картине
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.6, delay: 0.9 } }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <div className="case-bar">
        <p className="case-count">
          <span>{String(position.current).padStart(2, "0")}</span> / {String(position.total).padStart(2, "0")}
        </p>
        <div className="case-actions">
          <button type="button" className="icon-btn" onClick={onPrev} disabled={!onPrev} aria-label="Предыдущее место работы">
            ←
          </button>
          <button type="button" className="icon-btn" onClick={onNext} disabled={!onNext} aria-label="Следующее место работы">
            →
          </button>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
      </div>

      <section className="group">
        <div className="group-head">
          <p className="eyebrow">{job.product}</p>
          <h2 className="display">{job.company}</h2>
          <p className="job-meta">
            {job.role} · {job.period}
          </p>
          <p className="group-lead">{job.summary}</p>
        </div>
        <p className="scroll-hint" aria-hidden>
          Листайте вниз <span>↓</span>
        </p>
      </section>

      <div className="job-body">
        <div className="job-inner">
          <section aria-labelledby={`${job.id}-numbers`}>
            <h3 id={`${job.id}-numbers`} className="job-heading">
              Достижения в цифрах
            </h3>
            <div className="chart-grid">
              {job.metrics.map((m) => (
                <MetricCard key={m.title} m={m} />
              ))}
              <CareerTimeline current={job} />
            </div>
          </section>

          <section aria-labelledby={`${job.id}-results`}>
            <h3 id={`${job.id}-results`} className="job-heading">
              Результаты
            </h3>
            <div className="result-grid">
              {job.results.map((r) => (
                <ResultCard key={r.text} r={r} />
              ))}
            </div>
          </section>

          <section aria-labelledby={`${job.id}-tasks`}>
            <h3 id={`${job.id}-tasks`} className="job-heading">
              Основные задачи
            </h3>
            <div className="result-grid">
              {job.tasks.map((t) => (
                <ResultCard key={t.text} r={t} />
              ))}
            </div>
          </section>

          <section aria-labelledby={`${job.id}-stack`}>
            <h3 id={`${job.id}-stack`} className="job-heading">
              Стек
            </h3>
            <ul className="tags">
              {job.stack.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
