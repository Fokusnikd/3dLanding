// Стек для левой стены «Инструментарий»: ящики-плитки по группам и витрины с главными инструментами.

export type TileDef = { sym: string; name: string };
export type TileGroup = { title: string; color: string; tiles: TileDef[] };

// Плитки собираются в блоки по три в ряд, как в таблице элементов
export const stackGroups: TileGroup[] = [
  {
    title: "Язык и вёрстка",
    color: "#d9b36a",
    tiles: [
      { sym: "Ts", name: "TypeScript" },
      { sym: "Ht", name: "HTML" },
      { sym: "Cs", name: "CSS" },
      { sym: "Sc", name: "SCSS" },
      { sym: "Cm", name: "CSS Modules" },
      { sym: "Rd", name: "Responsive" },
    ],
  },
  {
    title: "Данные и API",
    color: "#6fc3c9",
    tiles: [
      { sym: "Rx", name: "Redux" },
      { sym: "Rf", name: "React Hook Form" },
      { sym: "Re", name: "REST APIs" },
      { sym: "Jr", name: "JSON-RPC" },
      { sym: "Ws", name: "WebSockets" },
      { sym: "Ce", name: "Centrifugo" },
      { sym: "Lf", name: "Leaflet" },
    ],
  },
  {
    title: "Интерфейс",
    color: "#d98ca0",
    tiles: [
      { sym: "Tw", name: "Tailwind CSS" },
      { sym: "Mu", name: "Material UI" },
      { sym: "Ad", name: "Ant Design" },
      { sym: "Fg", name: "Figma" },
    ],
  },
  {
    title: "Архитектура и скорость",
    color: "#a99be0",
    tiles: [
      { sym: "Sp", name: "SPA" },
      { sym: "Sr", name: "SSR" },
      { sym: "Ar", name: "Architecture" },
      { sym: "Cv", name: "Core Web Vitals" },
      { sym: "Pf", name: "Performance" },
    ],
  },
  {
    title: "Качество и поставка",
    color: "#8fcf8f",
    tiles: [
      { sym: "Jt", name: "Jest" },
      { sym: "Gt", name: "Git" },
      { sym: "Vt", name: "Vite" },
      { sym: "Wp", name: "Webpack" },
      { sym: "Dk", name: "Docker" },
      { sym: "Ci", name: "CI/CD" },
      { sym: "Es", name: "ESLint" },
    ],
  },
];

export type ExhibitId = "javascript" | "react" | "next" | "testing";

// Четыре витрины слева направо: по две по обе стороны от статуи
export const exhibits: { id: ExhibitId; title: string; sub: string }[] = [
  { id: "javascript", title: "JavaScript", sub: "Основной язык" },
  { id: "react", title: "React", sub: "Основной инструмент" },
  { id: "next", title: "Next.js", sub: "SSR и продакшен" },
  { id: "testing", title: "Playwright", sub: "Тестирование" },
];
