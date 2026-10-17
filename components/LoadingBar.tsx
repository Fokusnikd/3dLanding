"use client";

import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";

import { LOAD_STEPS } from "./controls";

const STAGES = LOAD_STEPS;

// Тонкий индикатор загрузки зала. Пока не готов первый этап — подпись с процентами по центру,
// дальше (этапы 2–3 догружаются в фоне) остаётся только линия сверху.
export default function LoadingBar({ loaded }: { loaded: number }) {
  const { progress, active } = useProgress();
  // drei считает долю по общему числу ресурсов, которое растёт с каждым этапом: держим максимум, чтобы линия не откатывалась
  const [shown, setShown] = useState(0);
  useEffect(() => {
    // готовые этапы + доля текущего (progress у drei — 0…100 по ресурсам, запрошенным к этому моменту)
    const now = loaded >= STAGES ? 100 : ((loaded + (active ? progress / 100 : 0)) / STAGES) * 100;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown((s) => Math.max(s, now));
  }, [progress, active, loaded]);

  const finished = loaded >= STAGES;
  const first = loaded < 5; // подпись с процентами, пока не готовы фасад (4 шага) и пол зала
  return (
    <div
      className={`loadbar${finished ? " is-done" : ""}${first ? " is-first" : ""}`}
      role="progressbar"
      aria-label="Загрузка зала"
      aria-valuenow={Math.round(shown)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="loadbar-line" style={{ transform: `scaleX(${Math.min(1, shown / 100)})` }} />
      <div className="loadbar-label">Готовим зал · {Math.round(shown)}%</div>
    </div>
  );
}
