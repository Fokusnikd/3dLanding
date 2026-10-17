// Геометрия зала и раскладка картин. Единицы — метры. Входная стена на z = 0, зал уходит в -z.
// Зал 16 × 20 × 7 м. Раскладка и размеры содержимого задавались под прежние 12 × 14 × 5.6 м,
// поэтому SX / SZ / SY пересчитывают прежние координаты, а SK — размеры предметов (картин, надписей, витрин).
export const HALF_W = 8;
export const DEPTH = 20;
export const ROOM_H = 7; // высота потолка
export const SX = HALF_W / 6;
export const SZ = DEPTH / 14;
export const SY = ROOM_H / 5.6;
export const SK = 1.3; // во сколько раз выросли предметы в зале
export const DOOR_W = 2.2;
export const DOOR_H = 4.6;
export const HTML_SCALE = 0.26 * SK; // масштаб HTML-надписей в 3D: 1 CSS-пиксель = HTML_SCALE «условных» единиц
export const FRAME_Y = 2.0 * SK; // центр картин

// Прожекторы: потолок, вылет от стены и свет (расстояния выросли, поэтому сила света растёт примерно как их квадрат)
export const SPOT_Y = ROOM_H - 0.4;
export const SPOT_OFF = 2.6 * SK; // отступ прожектора от стены
export const SPOT_K = 1.7; // множитель силы света
// Центр боковых стен вдоль зала сместился пропорционально глубине, а расстояния от центра растут вместе с предметами (SK):
// иначе надписи расходятся быстрее, чем растут сами, и на остановках выходят за края кадра.
export const WALL_MID_Z = -6.2 * SZ;
const aroundMid = (oldZ: number) => WALL_MID_Z + (oldZ + 6.2) * SK;
export const LEFT_SPOT_Z = [-9.4, -6.2, -3.0].map(aroundMid);
export const RIGHT_SPOT_Z = [-9.2, -3.3].map(aroundMid);
export const LEFT_BOARD_Z = WALL_MID_Z;
export const RIGHT_BOARD_Z = [-9.2, -3.3].map(aroundMid);

const WALL_GAP = 0.05; // рама чуть отступает от стены
const ART_GAP = 0.056; // картина чуть впереди рамы

export type FrameDef = {
  index: number; // сквозной индекс: сначала места работы (дальняя стена), затем примеры портфолио (правая стена)
  wall: "far" | "right" | "entrance";
  fit?: "cover" | "contain"; // как камера встаёт перед рамой: закрыть ею весь экран (по умолчанию) или вписать целиком
  position: [number, number, number]; // центр рамы
  rotY: number; // поворот; нормаль рамы = (sin rotY, 0, cos rotY)
  w: number;
  h: number;
};

const FAR = [
  { x: -3.6 * SK, w: 2.4 * SK, h: 1.6 * SK },
  { x: 0, w: 3.2 * SK, h: 2.13 * SK },
  { x: 3.6 * SK, w: 2.4 * SK, h: 1.6 * SK },
];
export const FAR_COUNT = FAR.length;

// Правая стена, «Примеры портфолио»: три картины разных размеров. Посередине стоит статуя фехтовальщика (z ≈ -8.9): слева от
// неё «Лендинги», справа «Дизайн» и длинная панорамная «Интерактивные веб-сервисы».
// Камера на остановке 3 стоит напротив z = RIGHT_PORTFOLIO_Z и видит примерно ±34° по горизонтали, поэтому всё держится между
// z ≈ -14.2 и z ≈ -2.3. Над статуей по центру стоит заголовок стены.
export const RIGHT_PORTFOLIO_Z = -7.9;
export const RIGHT_STATUE_Z = (RIGHT_BOARD_Z[0] + RIGHT_BOARD_Z[1]) / 2; // там стоит статуя: камера не должна пролетать сквозь неё
// Между двумя правыми картинами видимый просвет между багетами ~0.35 м (багет шире проёма примерно на 0.25 м с каждой стороны).
const RIGHT = [
  { z: -12.7, y: 3.0, w: 1.9, h: 1.27 },
  { z: -6.5, y: 3.0, w: 1.8, h: 1.2 },
  { z: -3.65, y: 3.0, w: 2.2, h: 0.8 },
];
// Электрощиток висит на входной стене (на остановке 4), над статуей скалолаза (x = -4, верх статуи с постаментом ≈ 3.4 м):
// шкаф начинается выше 4.1 м, поэтому статуя его не закрывает. «Рама» для камеры чуть больше самого шкафа, чтобы он влез в кадр.
export const PANEL = { x: -4.0, y: 4.6, z: -0.25, w: 1.35, h: 0.95, frameW: 2.2, frameH: 1.4 };

// Три главные работы на дальней стене и три примера портфолио на правой
export const FRAMES: FrameDef[] = [
  ...FAR.map(
    (f, i): FrameDef => ({
      index: i,
      wall: "far",
      position: [f.x, FRAME_Y, -DEPTH + WALL_GAP],
      rotY: 0,
      w: f.w,
      h: f.h,
    }),
  ),
  ...RIGHT.map(
    (f, i): FrameDef => ({
      index: FAR.length + i,
      wall: "right",
      position: [HALF_W - WALL_GAP, f.y, f.z],
      rotY: -Math.PI / 2, // нормаль рамы смотрит в −x, к центру зала
      w: f.w,
      h: f.h,
    }),
  ),
  // электрощиток: не картина, но камера подлетает к нему так же. Стена входная, нормаль смотрит в −z, в зал
  {
    index: FAR.length + RIGHT.length,
    wall: "entrance",
    position: [PANEL.x, PANEL.y, PANEL.z],
    rotY: Math.PI,
    w: PANEL.frameW,
    h: PANEL.frameH,
    fit: "contain", // шкаф с открытой дверцей должен поместиться в кадр целиком, в том числе на узком экране
  },
];

// На какой остановке камеры видна стена с картинами
export const WALL_STOP = { far: 1, right: 3, entrance: 4 } as const;

// Центр самой картины в мире (нужен, чтобы подлететь и выровняться строго перед ней)
export function artCenter(f: FrameDef): [number, number, number] {
  return [
    f.position[0] + Math.sin(f.rotY) * ART_GAP,
    f.position[1],
    f.position[2] + Math.cos(f.rotY) * ART_GAP,
  ];
}

