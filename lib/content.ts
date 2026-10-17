// ВСЁ, ЧТО НИЖЕ — ПЛЕЙСХОЛДЕРЫ. Замените на свои данные.

export const profile = {
  name: "Ваше Имя",
  role: "Дизайнер и разработчик",
  city: "Москва",
  email: "hello@example.com",
  status: "Открыт к новым проектам",
  headline: "Создаю цифровые вещи, которые хочется *трогать*",
  intro:
    "Проектирую и разрабатываю интерфейсы, где выверена каждая деталь — от сетки и типографики до последнего миллисекундного перехода.",
  about: [
    "Я соединяю дизайн и код, поэтому идея доходит до экрана без потерь: от первого наброска до продакшена.",
    "Люблю тихую роскошь — когда интерфейс не кричит, а ощущается дорогим: в свете, стекле, ритме и плавности движения.",
  ],
  socials: [
    { label: "Telegram", href: "https://t.me/" },
    { label: "GitHub", href: "https://github.com/" },
    { label: "Behance", href: "https://behance.net/" },
  ],
  // Положите свой файл в public/cv.pdf или замените ссылку
  cv: { label: "Скачать CV", href: "/cv.pdf" },
};

export const stats = [
  { value: 7, suffix: "+", label: "лет в профессии" },
  { value: 40, suffix: "+", label: "реализованных проектов" },
  { value: 12, suffix: "", label: "наград и публикаций" },
];

export const skills = [
  "Product Design",
  "Next.js",
  "React",
  "TypeScript",
  "Motion Design",
  "Design Systems",
  "Brand Identity",
  "WebGL",
  "Creative Coding",
  "UX Research",
];

// Место работы: картина на стене зала. Клик по ней открывает страницу с описанием, задачами, результатами и стеком.
// Достижения в цифрах: рисуются графиками на странице места работы. Только числа, которые есть в резюме.
export type Metric =
  | {
      kind: "compare"; // два столбца «до / после»
      title: string;
      unit: string;
      before: { label: string; value: number };
      after: { label: string; value: number };
      delta: string; // крупная подпись результата
      note?: string;
    }
  | { kind: "people"; title: string; total: number; unit: string; note?: string } // сетка точек
  | { kind: "counter"; title: string; value: number; unit: string; note?: string }; // крупное число

// Результат с мини-схемой, показывающей, что именно изменилось
export type ResultViz =
  | { kind: "flow"; before: string[]; after: string[] } // цепочки шагов «было → стало»
  | { kind: "badge"; value: string; caption: string } // крупная цифра
  | { kind: "chain"; count: number; caption: string } // последовательность проектов
  | { kind: "steps"; items: string[] } // процесс: шаг → шаг → шаг
  | { kind: "tags"; items: string[] }; // набор понятий без порядка

// Пункт с мини-схемой: и результаты, и основные задачи
export type Result = { text: string; viz?: ResultViz };
export type Task = Result;

export type Job = {
  id: string;
  from: string; // начало, YYYY-MM
  to: string | null; // конец, YYYY-MM; null — по настоящее время
  company: string; // название на табличке
  product: string; // над названием на странице места работы
  role: string;
  period: string;
  summary: string;
  tasks: Task[];
  results: Result[];
  stack: string[];
  metrics: Metric[];
  hues: [number, number]; // цвета «картины» на стене
};

// Порядок слева направо: хронологически, в центре самое длинное место работы
export const jobs: Job[] = [
  {
    id: "bigsalmon",
    from: "2019-08",
    to: "2020-01",
    company: "BigSalmon",
    product: "Agricultural CRM",
    role: "Frontend Developer",
    period: "Август 2019 – Январь 2020",
    summary:
      "CRM для сельскохозяйственных компаний, автоматизировавшая документооборот и внутренние бизнес-процессы. Около 500 пользователей.",
    tasks: [
      {
        text: "Разрабатывал справочники, формы и переиспользуемые UI-компоненты в рамках существующей frontend-архитектуры.",
        viz: { kind: "tags", items: ["Справочники", "Формы", "UI-компоненты"] },
      },
      {
        text: "Реализовывал компоненты и бизнес-сценарии различной сложности.",
        viz: { kind: "tags", items: ["Компоненты", "Бизнес-сценарии", "Разная сложность"] },
      },
      {
        text: "Писал unit-тесты для UI-компонентов и frontend-логики.",
        viz: { kind: "steps", items: ["Компонент", "Unit-тест", "Проверено"] },
      },
    ],
    results: [
      {
        text: "Участвовал в цифровизации бумажного документооборота и ручных процессов для системы примерно на 500 пользователей.",
        viz: { kind: "flow", before: ["Бумажные документы", "Ручные процессы"], after: ["Единая CRM", "~500 пользователей"] },
      },
    ],
    stack: ["React", "TypeScript", "Redux", "Ant Design", "Tailwind CSS", "Unit Testing"],
    metrics: [
      { kind: "people", title: "Пользователи системы", total: 500, unit: "человек", note: "Цифровизация бумажного документооборота и ручных процессов. Каждая точка — 10 пользователей." },
    ],
    hues: [92, 48],
  },
  {
    id: "checkbox",
    from: "2020-01",
    to: "2026-05",
    company: "Checkbox",
    product: "Last-Mile Delivery Platform",
    role: "Frontend Developer",
    period: "Январь 2020 – Май 2026",
    summary:
      "Внутренняя платформа для управления заказами, курьерами, зонами доставки и операционными процессами. Работал напрямую с логистикой, support-командой, операторами и другими пользователями системы.",
    tasks: [
      {
        text: "Проектировал, разрабатывал и развивал ключевые интерфейсы внутренней логистической платформы: распределение заказов, управление курьерами и зонами доставки и т. д.",
        viz: { kind: "tags", items: ["Распределение заказов", "Управление курьерами", "Зоны доставки"] },
      },
      {
        text: "Совместно с операционными командами анализировал workflows и пользовательские проблемы, превращая их в продуктовые и технические решения.",
        viz: { kind: "steps", items: ["Workflow операторов", "Анализ проблем", "Продуктовое и техническое решение"] },
      },
      {
        text: "Проектировал и развивал real-time интерфейсы: live-обновления заказов, синхронизацию данных и отслеживание курьеров.",
        viz: { kind: "steps", items: ["Backend", "WebSockets / Centrifugo", "Live-обновление интерфейса"] },
      },
      {
        text: "Разрабатывал map-based функциональность на Leaflet, включая управление зонами доставки и отображение курьеров.",
        viz: { kind: "tags", items: ["Leaflet", "Зоны доставки", "Курьеры на карте"] },
      },
      {
        text: "Создавал self-service инструменты для операционных команд, сокращая необходимость участия разработчиков в рутинной настройке системы.",
        viz: { kind: "flow", before: ["Оператор", "Разработчик", "Настройка"], after: ["Оператор", "Self-service инструмент"] },
      },
      {
        text: "Согласовывал с backend- и algorithm-разработчиками API-контракты, data flow и интеграции.",
        viz: { kind: "steps", items: ["Frontend", "API-контракт", "Backend и algorithm"] },
      },
      {
        text: "Взял на себя техническое лидерство при расширении frontend-команды: определял архитектурные решения, декомпозировал и распределял задачи, проводил code review и менторил разработчиков.",
        viz: { kind: "steps", items: ["Архитектура", "Декомпозиция задач", "Code review", "Менторинг"] },
      },
      {
        text: "Создавал быстрые MVP для проверки бизнес-гипотез и новых операционных процессов.",
        viz: { kind: "steps", items: ["Бизнес-гипотеза", "MVP", "Проверка"] },
      },
    ],
    results: [
      {
        text: "Развил frontend от отдельных операционных интерфейсов до комплексной внутренней логистической платформы.",
        viz: { kind: "flow", before: ["Отдельные интерфейсы"], after: ["Единая логистическая платформа"] },
      },
      {
        text: "Взаимодействуя с операторами и перерабатывая компоненты под их новые требования, сократил время выполнения операторских задач в 3 раза.",
        viz: { kind: "badge", value: "÷ 3", caption: "время операторских задач" },
      },
      {
        text: "Создал frontend-инструменты для самостоятельной настройки операционных процессов, перенёс часть операций, ранее выполнявшихся backend-разработчиками через базу данных, в интерфейс платформы и сократил количество обращений к backend-команде.",
        viz: { kind: "flow", before: ["Оператор", "Backend-разработчик", "База данных"], after: ["Оператор", "Интерфейс платформы"] },
      },
    ],
    stack: ["React", "TypeScript", "JavaScript", "Redux", "React Hook Form", "Tailwind CSS", "REST APIs", "Webpack", "Git", "Leaflet", "Centrifugo", "WebSockets"],
    metrics: [
      {
        kind: "compare",
        title: "Время выполнения операторских задач",
        unit: "% от исходного",
        before: { label: "До", value: 100 },
        after: { label: "После", value: 33 },
        delta: "в 3 раза быстрее",
        note: "Переработал компоненты под новые требования операторов.",
      },
    ],
    hues: [205, 168],
  },
  {
    id: "freelance",
    from: "2026-05",
    to: null,
    company: "Freelance Projects",
    product: "Промо-сайты продуктов",
    role: "Frontend Developer",
    period: "Май 2026 – настоящее время",
    summary:
      "Долгосрочное сотрудничество с одним клиентом: разработка и поддержка четырёх мультиязычных промо-сайтов на React, Next.js и TypeScript. Основные направления: быстрый запуск MVP, SSR, SEO, Core Web Vitals, адаптивные интерфейсы и frontend performance.",
    tasks: [
      {
        text: "Разработал и запустил четыре production-сайта на React, Next.js и TypeScript.",
        viz: { kind: "chain", count: 4, caption: "React · Next.js · TypeScript" },
      },
      {
        text: "Реализовывал адаптивные интерфейсы по Figma: лендинги, формы, карусели, видеоблоки и пользовательские сценарии.",
        viz: { kind: "steps", items: ["Макет в Figma", "Адаптивный интерфейс", "Лендинги, формы, карусели, видео"] },
      },
      {
        text: "Оптимизировал Core Web Vitals и производительность страниц в рамках SEO.",
        viz: { kind: "steps", items: ["Core Web Vitals", "Оптимизация страниц", "SEO"] },
      },
      {
        text: "Напрямую работал с клиентом и дизайнером, уточнял требования и согласовывал изменения backend API.",
        viz: { kind: "steps", items: ["Клиент и дизайнер", "Уточнение требований", "Изменения backend API"] },
      },
      {
        text: "Координировал второго frontend-разработчика: декомпозировал и распределял задачи, проводил code review.",
        viz: { kind: "steps", items: ["Декомпозиция", "Распределение задач", "Code review"] },
      },
      {
        text: "Поддерживал и развивал проекты после запуска.",
        viz: { kind: "steps", items: ["Запуск", "Поддержка", "Развитие"] },
      },
    ],
    results: [
      {
        text: "Запустил четыре production-сайта для одного долгосрочного клиента.",
        viz: { kind: "badge", value: "4", caption: "production-сайта" },
      },
      {
        text: "Сократил цикл разработки MVP с 23 дней на первом проекте до 14 дней на четвёртом.",
        viz: { kind: "badge", value: "23 → 14", caption: "дней на MVP" },
      },
      {
        text: "Продолжил сотрудничество с клиентом в рамках последовательных проектов.",
        viz: { kind: "chain", count: 4, caption: "один клиент, проект за проектом" },
      },
      {
        text: "Реализовал мультиязычные версии продуктов для нескольких рынков.",
        viz: { kind: "badge", value: "i18n", caption: "несколько рынков" },
      },
    ],
    stack: ["React", "Next.js", "TypeScript", "Tailwind CSS", "Ant Design", "Weglot", "SSR", "REST APIs", "Vite", "Docker", "CI/CD", "Core Web Vitals"],
    metrics: [
      {
        kind: "compare",
        title: "Цикл разработки MVP",
        unit: "дней",
        before: { label: "1-й сайт", value: 23 },
        after: { label: "4-й сайт", value: 14 },
        delta: "на 39% быстрее",
      },
      { kind: "counter", title: "Production-сайтов запущено", value: 4, unit: "сайта", note: "Мультиязычные версии для нескольких рынков." },
    ],
    hues: [34, 12],
  },
];

// Примеры портфолио: картины на правой стене. Клик открывает окно со ссылками на проекты.
// ПЛЕЙСХОЛДЕРЫ: подставьте свои проекты. href: "" — ссылка ещё не задана (карточка показывается без перехода).
export type ShowcaseItem = {
  title: string;
  blurb: string;
  tags: string[];
  href: string;
};

export type Showcase = {
  id: string;
  title: string; // название на табличке
  kicker: string; // короткая подпись над названием на странице
  blurb: string;
  linkLabel: string; // куда ведут ссылки: подпись на кнопке карточки
  hues: [number, number]; // цвета «картины» на стене
  items: ShowcaseItem[];
};

export const showcase: Showcase[] = [
  {
    id: "landings",
    title: "Лендинги",
    kicker: "Сайты и промо-страницы",
    blurb: "Страницы, которые запоминаются с первого экрана: сильная подача, анимация и быстрая загрузка.",
    linkLabel: "Открыть на GitHub Pages",
    hues: [34, 12],
    items: [
      { title: "Лендинг 1", blurb: "Короткое описание проекта.", tags: ["Next.js", "Tailwind CSS"], href: "" },
      { title: "Лендинг 2", blurb: "Короткое описание проекта.", tags: ["React", "TypeScript"], href: "" },
    ],
  },
  {
    id: "design",
    title: "Дизайн",
    kicker: "Интерфейсы и макеты",
    blurb: "Макеты и прототипы: от структуры экранов до готовых к разработке интерфейсов.",
    linkLabel: "Открыть в Figma",
    hues: [262, 330],
    items: [
      { title: "Макет 1", blurb: "Короткое описание макета.", tags: ["Figma", "UI"], href: "" },
      { title: "Макет 2", blurb: "Короткое описание макета.", tags: ["Figma", "Prototype"], href: "" },
    ],
  },
  {
    id: "interactive",
    title: "Интерактивные веб-сервисы",
    kicker: "Приложения с логикой",
    blurb: "Веб-сервисы с данными и взаимодействием: графики, формы, карты и работа в реальном времени.",
    linkLabel: "Открыть на GitHub Pages",
    hues: [168, 215],
    items: [
      { title: "Сервис 1", blurb: "Короткое описание сервиса.", tags: ["React", "TypeScript"], href: "" },
      { title: "Сервис 2", blurb: "Короткое описание сервиса.", tags: ["React", "REST APIs"], href: "" },
    ],
  },
];

// Все картины на стенах по сквозному индексу (как FRAMES в lib/gallery.ts): сначала места работы, затем примеры портфолио
// Последним идёт электрощиток (экран статистики): это не картина, но открывается так же, кликом по объекту на стене.
export type Entry = { kind: "job"; job: Job } | { kind: "showcase"; group: Showcase } | { kind: "stats" };
export const entries: Entry[] = [
  ...jobs.map((job): Entry => ({ kind: "job", job })),
  ...showcase.map((group): Entry => ({ kind: "showcase", group })),
  { kind: "stats" },
];

// Что рисовать на табличке под картиной и в самой картине (у электрощитка ни того ни другого нет)
export function entryMeta(e: Exclude<Entry, { kind: "stats" }>) {
  return e.kind === "job"
    ? { id: e.job.id, title: e.job.company, sub: e.job.period, hues: e.job.hues }
    : { id: e.group.id, title: e.group.title, sub: e.group.kicker, hues: e.group.hues };
}

// Подписи стен в музее
export const museum = {
  worksTitle: "Опыт работы",
  portfolioTitle: "Примеры портфолио",
  stackTitle: "Инструментарий",
  aboutTitle: "Дизайн — это внимание к деталям",
  contactTitle: "Давайте сделаем что-то особенное",
  exitTitle: "Спасибо, что заглянули",
  exitHint: "Прокрутите, чтобы выйти",
};
