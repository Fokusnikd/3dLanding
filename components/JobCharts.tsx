"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView } from "motion/react";
import { jobs, type Job, type Metric, type Result, type ResultViz } from "@/lib/content";

const EASE = [0.22, 1, 0.36, 1] as const;

export type BarRow = { label: string; value: number; tone: "before" | "after" };

// Горизонтальные столбцы в одном масштабе, растут при появлении в окне. Нужны и для достижений, и для экрана статистики.
export function BarsChart({ rows, unit, delta, format = String }: { rows: BarRow[]; unit?: string; delta?: string; format?: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <>
      <div className="chart-bars">
        {rows.map((r, i) => (
          <div className="chart-bar-row" key={r.label}>
            <span className="chart-bar-label">{r.label}</span>
            <div className="chart-bar-track">
              <motion.div
                className={`chart-bar chart-bar-${r.tone}`}
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.max(0.6, (r.value / max) * 100)}%` }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1.1, delay: 0.15 + i * 0.35, ease: EASE }}
              />
            </div>
            <span className="chart-bar-value">{format(r.value)}</span>
          </div>
        ))}
      </div>
      {unit && <p className="chart-unit">{unit}</p>}
      {delta && <p className="chart-delta display">{delta}</p>}
    </>
  );
}

// «До / после» для достижений
function Compare({ m }: { m: Extract<Metric, { kind: "compare" }> }) {
  return (
    <BarsChart
      rows={[
        { ...m.before, tone: "before" },
        { ...m.after, tone: "after" },
      ]}
      unit={m.unit}
      delta={m.delta}
    />
  );
}

// Сетка точек: каждая точка — десять человек
function People({ m }: { m: Extract<Metric, { kind: "people" }> }) {
  const dots = Math.round(m.total / 10);
  return (
    <>
      <p className="chart-big display">
        ~{m.total} <small>{m.unit}</small>
      </p>
      <div className="chart-dots" aria-hidden>
        {Array.from({ length: dots }, (_, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.3 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4, delay: i * 0.018, ease: EASE }}
          />
        ))}
      </div>
    </>
  );
}

function Counter({ m }: { m: Extract<Metric, { kind: "counter" }> }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, m.value, { duration: 1.2, ease: EASE, onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, m.value]);
  return (
    <p className="chart-big display" ref={ref}>
      {n} <small>{m.unit}</small>
    </p>
  );
}

export function MetricCard({ m }: { m: Metric }) {
  return (
    <article className="chart-card">
      <h4 className="chart-title">{m.title}</h4>
      {m.kind === "compare" && <Compare m={m} />}
      {m.kind === "people" && <People m={m} />}
      {m.kind === "counter" && <Counter m={m} />}
      {m.note && <p className="chart-note">{m.note}</p>}
    </article>
  );
}

// Цепочка шагов: плашки со стрелками между ними
function Steps({ items, tone, arrows = true }: { items: string[]; tone: "before" | "after" | "plain" | "tags"; arrows?: boolean }) {
  return (
    <ol className={`viz-steps viz-${tone}`}>
      {items.map((s, i) => (
        <li key={s}>
          {arrows && i > 0 && <span className="viz-link" aria-hidden>→</span>}
          <span className="viz-chip">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Viz({ v }: { v: ResultViz }) {
  if (v.kind === "flow")
    return (
      <div className="viz viz-flow">
        <Steps items={v.before} tone="before" />
        <span className="viz-arrow" aria-hidden>
          ↓
        </span>
        <Steps items={v.after} tone="after" />
      </div>
    );
  if (v.kind === "steps" || v.kind === "tags")
    return (
      <div className="viz">
        <Steps items={v.items} tone={v.kind === "steps" ? "plain" : "tags"} arrows={v.kind === "steps"} />
      </div>
    );
  if (v.kind === "badge")
    return (
      <div className="viz viz-badge">
        <strong className="display">{v.value}</strong>
        <span>{v.caption}</span>
      </div>
    );
  return (
    <div className="viz viz-chain">
      <ol aria-hidden>
        {Array.from({ length: v.count }, (_, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, scale: 0.4 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, delay: i * 0.25, ease: EASE }}
          >
            {i + 1}
          </motion.li>
        ))}
      </ol>
      <span>{v.caption}</span>
    </div>
  );
}

// Результат: сверху схема «что изменилось», ниже сама формулировка из резюме
export function ResultCard({ r }: { r: Result }) {
  return (
    <article className="result-card">
      {r.viz && <Viz v={r.viz} />}
      <p>{r.text}</p>
    </article>
  );
}

// Карьера на одной шкале: длина полосы = длительность, текущее место работы подсвечено
const monthIndex = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};
const NOW = (() => {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
})();

export function CareerTimeline({ current }: { current: Job }) {
  const start = Math.min(...jobs.map((j) => monthIndex(j.from)));
  const total = NOW - start;
  const years: number[] = [];
  for (let y = Math.ceil(start / 12); y * 12 <= NOW; y++) years.push(y);
  return (
    <div className="chart-card chart-wide">
      <h4 className="chart-title">Карьера на одной шкале</h4>
      <div className="timeline">
        <div className="timeline-axis" aria-hidden>
          {years.map((y) => (
            <span key={y} style={{ left: `${((y * 12 - start) / total) * 100}%` }}>
              {y}
            </span>
          ))}
        </div>
        {jobs.map((j, i) => {
          const a = monthIndex(j.from);
          const b = j.to ? monthIndex(j.to) : NOW;
          const months = b - a;
          const label = months >= 12 ? `${(months / 12).toFixed(1).replace(".", ",")} г.` : `${months} мес.`;
          return (
            <div className="timeline-row" key={j.id}>
              <motion.div
                className={j.id === current.id ? "timeline-bar is-current" : "timeline-bar"}
                style={{ left: `${((a - start) / total) * 100}%` }}
                initial={{ width: 0 }}
                whileInView={{ width: `${(months / total) * 100}%` }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1, delay: 0.1 + i * 0.25, ease: EASE }}
              />
              {/* у правого края подпись встаёт слева от полосы, иначе уйдёт за карточку */}
              <span
                className="timeline-name"
                style={
                  (a - start) / total > 0.6
                    ? { right: `${(1 - (a - start) / total) * 100}%` }
                    : { left: `${((a - start) / total) * 100}%` }
                }
              >
                {j.company} · {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
