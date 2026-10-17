// Живые замеры сцены для экрана «Электрощиток». Считает их DebugStats: обычно только при ?debug, а пока экран открыт — всегда.
// Здесь только общий кусочек состояния: «кто-то просит замеры» и последние посчитанные значения.
export type LiveStats = Record<string, number | string>;

let wanted = false;
let last: LiveStats | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const liveStats = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  isWanted: () => wanted,
  setWanted(v: boolean) {
    if (wanted === v) return;
    wanted = v;
    notify();
  },
  get: () => last,
  publish(s: LiveStats) {
    last = s;
    notify();
  },
};
