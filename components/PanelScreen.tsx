"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import raw from "@/lib/assetStats.json";
import { LOAD_STEPS } from "./controls";
import { liveStats } from "./liveStats";

// Дисплей внутри электрощитка: статистика ассетов и оптимизации. Рисуется HTML-ом прямо в сцене (см. ElectricPanel),
// листать вниз не нужно: страницы переключаются «автоматами» под экраном.
// Цифры — из lib/assetStats.json (scripts/asset-stats.mjs сравнивает оригиналы из assets-src с файлами из public).

const MB = 1048576;
const mb = (b: number) => b / MB;
const nf = new Intl.NumberFormat("ru", { maximumFractionDigits: 0 });
const fmtMb = (v: number) => `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(".", ",")} МБ`;
// «в 8,8 раза», «в 16 раз», «в 22 раза»: у дробных и у целых чисел склонение разное
const fmtX = (before: number, after: number) => {
  const x = before / after;
  if (x < 10) return `в ${x.toFixed(1).replace(".", ",")} раза`;
  const n = Math.round(x);
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `в ${n} ${few ? "раза" : "раз"}`;
};

const MODEL_NAMES: Record<string, string> = {
  emblem_js: "Эмблема JavaScript",
  emblem_next: "Эмблема Next.js",
  emblem_playwright: "Эмблема Playwright",
  lantern: "Фонарь фасада",
  statue_boardgames: "Статуя: настольные игры",
  statue_climbing: "Статуя: скалолазание",
  statue_fencing: "Статуя: фехтование",
  statue_games: "Статуя: видеоигры",
};

type Model = { name: string; beforeBytes: number; afterBytes: number; trisBefore: number; trisAfter: number };
const models = raw.models.filter((m) => m.beforeBytes !== null) as Model[];
const modelsBefore = models.reduce((a, m) => a + m.beforeBytes, 0);
const modelsAfter = models.reduce((a, m) => a + m.afterBytes, 0);
const trisBefore = models.reduce((a, m) => a + m.trisBefore, 0);
const trisAfter = models.reduce((a, m) => a + m.trisAfter, 0);
const tex = raw.textures;
const fac = raw.facade;
const totalBefore = modelsBefore + fac.beforeBytes + tex.jpgBytes;
const totalAfter = modelsAfter + fac.afterBytes + tex.shippedBytes;

// Порядок этапов загрузки зала: см. LOAD_STEPS в components/controls.ts и цепочку Stage в Room
const STAGES = ["Фонари", "Колонны", "Стена и дверь", "Пол и стены", "Каркас зала", "Картины", "Инструментарий", "Статуи и эмблемы"];

type Row = { label: string; value: number; tone: "before" | "after" };

// Столбцы в одном масштабе. Растут через CSS-переход после появления страницы (IntersectionObserver в CSS 3D ненадёжен).
function Bars({ rows, format = fmtMb }: { rows: Row[]; format?: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value));
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="ps-bars">
      {rows.map((r, i) => (
        <div className="ps-bar-row" key={r.label}>
          <span className="ps-bar-label">{r.label}</span>
          <div className="ps-bar-track">
            <div
              className={`ps-bar ps-bar-${r.tone}`}
              style={{ width: on ? `${Math.max(0.8, (r.value / max) * 100)}%` : "0%", transitionDelay: `${0.1 + i * 0.25}s` }}
            />
          </div>
          <span className="ps-bar-value">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

const Card = ({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) => (
  <div className="ps-card">
    <h4>{title}</h4>
    {children}
    {note && <p className="ps-note">{note}</p>}
  </div>
);

function Total() {
  return (
    <div className="ps-page">
      <Card title="Вес ассетов: модели, фасад и текстуры зала" note="Оригиналы: исходные модели (нейросети, Blender) и картинки до сжатия. На сайте: то, что лежит в public/.">
        <Bars
          rows={[
            { label: "Оригиналы", value: mb(totalBefore), tone: "before" },
            { label: "На сайте", value: mb(totalAfter), tone: "after" },
          ]}
        />
        <p className="ps-delta display">{fmtX(totalBefore, totalAfter)} меньше</p>
      </Card>
      <div className="ps-trio">
        <div className="ps-mini">
          <strong className="display">{fmtX(modelsBefore, modelsAfter)}</strong>
          <span>модели: {fmtMb(mb(modelsBefore))} → {fmtMb(mb(modelsAfter))}</span>
        </div>
        <div className="ps-mini">
          <strong className="display">{fmtX(fac.beforeBytes, fac.afterBytes)}</strong>
          <span>фасад: {fmtMb(mb(fac.beforeBytes))} → {fmtMb(mb(fac.afterBytes))}</span>
        </div>
        <div className="ps-mini">
          <strong className="display">{fmtX(tex.vramRawBytes, tex.vramCompressedBytes)}</strong>
          <span>видеопамять текстур: {fmtMb(mb(tex.vramRawBytes))} → {fmtMb(mb(tex.vramCompressedBytes))}</span>
        </div>
      </div>
    </div>
  );
}

function Models() {
  return (
    <div className="ps-page">
      <table className="ps-table">
        <thead>
          <tr>
            <th>Модель</th>
            <th>Файл</th>
            <th>Треугольники</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.name}>
              <td>{MODEL_NAMES[m.name] ?? m.name}</td>
              <td>
                {fmtMb(mb(m.beforeBytes))} → <strong>{fmtMb(mb(m.afterBytes))}</strong>
              </td>
              <td>
                {nf.format(m.trisBefore)} → <strong>{nf.format(m.trisAfter)}</strong>
              </td>
            </tr>
          ))}
          <tr className="ps-total">
            <td>Всего</td>
            <td>
              {fmtMb(mb(modelsBefore))} → <strong>{fmtMb(mb(modelsAfter))}</strong>
            </td>
            <td>
              {nf.format(trisBefore)} → <strong>{nf.format(trisAfter)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="ps-note">Статуи упрощены в Blender с ~120 тысяч до ~20 тысяч треугольников, геометрия сжата meshopt, текстуры в WebP.</p>
    </div>
  );
}

function Textures() {
  return (
    <div className="ps-page ps-two">
      <Card title={`Вес файлов (${tex.sets} набора, ${tex.maps} карт)`} note="KTX2 весит больше WebP: плата за то, что текстура остаётся сжатой в видеопамяти.">
        <Bars
          rows={[
            { label: "JPG", value: mb(tex.jpgBytes), tone: "before" },
            { label: "WebP", value: mb(tex.webpBytes), tone: "before" },
            { label: "KTX2", value: mb(tex.shippedBytes), tone: "after" },
          ]}
        />
      </Card>
      <Card title="Видеопамять (оценка)" note="По размерам карт с мипами: RGBA8 без сжатия против 1 байта на пиксель у KTX2.">
        <Bars
          rows={[
            { label: "Без сжатия", value: mb(tex.vramRawBytes), tone: "before" },
            { label: "KTX2", value: mb(tex.vramCompressedBytes), tone: "after" },
          ]}
        />
        <p className="ps-delta display">{fmtX(tex.vramRawBytes, tex.vramCompressedBytes)} меньше</p>
      </Card>
    </div>
  );
}

function Loading() {
  return (
    <div className="ps-page">
      <Card title={`Зал грузится ${LOAD_STEPS} этапами по очереди`}>
        <ol className="ps-stages">
          {STAGES.map((s, i) => (
            <li key={s}>
              <span>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </Card>
      <div className="ps-trio">
        <div className="ps-mini">
          <strong>В скрытом виде</strong>
          <span>Следующий этап стартует в спокойный момент, шейдеры собираются заранее: без просадок кадра.</span>
        </div>
        <div className="ps-mini">
          <strong>Заглушки света</strong>
          <span>Число источников света постоянно с самого начала: шейдеры уже показанного не пересобираются.</span>
        </div>
        <div className="ps-mini">
          <strong>Заготовка 1,6 КБ</strong>
          <span>Пока грузится фасад, виден его размытый кадр 128×84, настоящий проявляется поверх.</span>
        </div>
      </div>
    </div>
  );
}

function Live() {
  const s = useSyncExternalStore(liveStats.subscribe, liveStats.get, () => null);
  useEffect(() => {
    liveStats.setWanted(true); // живые замеры считаются только пока эта страница открыта
    return () => liveStats.setWanted(false);
  }, []);
  if (!s) return <p className="ps-note">Замеры включаются…</p>;
  const cards: [string, string][] = [
    ["FPS", String(s.fps)],
    ["Время кадра", `${s.frameMsAvg} мс`],
    ["Вызовов отрисовки", nf.format(Number(s.drawCalls))],
    ["Треугольников в кадре", nf.format(Number(s.triangles))],
    ["Геометрий", nf.format(Number(s.geometries))],
    ["Текстур в видеопамяти", `${s.textureCount} · ~${s.textureVramMb} МБ`],
    ["Шейдеров", String(s.programs)],
    ["По сети (без кэша)", `${s.loadedMb} МБ · ${s.loadedFiles} ф.`],
  ];
  return (
    <div className="ps-page ps-live">
      {cards.map(([k, v]) => (
        <div className="ps-mini" key={k}>
          <strong className="display">{v}</strong>
          <span>{k}</span>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { id: "total", label: "Итого", view: Total },
  { id: "models", label: "Модели", view: Models },
  { id: "textures", label: "Текстуры", view: Textures },
  { id: "loading", label: "Загрузка", view: Loading },
  { id: "live", label: "Сейчас", view: Live },
] as const;

// Содержимое дисплея: заголовок, страница и ряд переключателей. Размер фиксирован (800×450 px): им управляет масштаб Html.
export default function PanelScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("total");
  const View = TABS.find((t) => t.id === tab)!.view;
  return (
    <div className="pscreen">
      <header className="ps-head">
        <span className="ps-title">Ассеты и оптимизация</span>
        <span className="ps-date">данные от {new Date(raw.generatedAt).toLocaleDateString("ru")}</span>
      </header>
      <div className="ps-body" key={tab}>
        <View />
      </div>
      <nav className="ps-tabs" aria-label="Страницы статистики">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={t.id === tab ? "ps-tab is-on" : "ps-tab"} aria-pressed={t.id === tab} onClick={() => setTab(t.id)}>
            <span className="ps-led" aria-hidden />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// Кнопка выхода, пока щиток открыт
export function PanelHud({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <button type="button" className="statue-back" onClick={onClose}>
      <span aria-hidden>←</span> Закрыть щиток <kbd>Esc</kbd>
    </button>
  );
}
