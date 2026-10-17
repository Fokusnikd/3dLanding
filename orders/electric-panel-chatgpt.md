# Заказ для ChatGPT: текстуры электрощитка

Электрощиток висит на правой стене зала: металлический шкаф 1.35 × 0.95 × 0.22 м, дверца на левых петлях, внутри дисплей и DIN-рейка с автоматами (components/ElectricPanel.tsx).
Сейчас всё нарисовано плоскими цветами и canvas-табличкой. Нужны 13 картинок. Те же заказы лежат в Figma (рамки `REQUEST — ASSET_panel_…`, файл «сайт»).

Общие правила (вставляйте в начало чата или в «инструкции чата»):
- Один заказ — один чат (режим «изображение»), чтобы стиль не «плыл» между материалами.
- Фотореализм, как фото реального материала, максимальная резкость. Свет мягкий и ровный: без теней, бликов и градиентов по кадру (свет и тени добавит 3D).
- Без людей, текста, цифр, надписей, логотипов и водяных знаков. Все подписи, в том числе кириллицу, я дорисую в коде: где нужны «надписи», просите нечитаемые значки.
- Материалы идут парой: albedo + height (чёрно-белая карта высоты). Normal, roughness и AO я сделаю из height скриптом. Height просите вторым сообщением в том же чате.
- Предметы и наклейки — на однотонном фоне #FF00FF (пурпурный), без теней на фоне: вырежу сам. Серые маски — строго в градациях серого.
- Бесшовные материалы проверяйте так: положите две копии рядом, шва быть не должно.

Фраза для height-карты (второе сообщение в том же чате, для P1, P2, P4, P5):

```
Now output exactly the same image as a grayscale height map: white = raised, black = recessed, same framing and scale, same seamless tiling, only height information, no color. Same size.
```

---

## P1. Корпус и дверца: крашеная сталь (`steel_paint`, 2048×2048, бесшовная, + height)

```
Seamless tileable top-down photographic texture of powder-coated sheet steel painted dark grey-green (#4a554b), fine orange-peel surface texture, extremely light micro-scratches and a few tiny dust specks, flat even soft diffuse light, no shadows, no highlights, no gradient across the image, no edges, no bolts, no objects, no text. All four edges continue each other perfectly so it tiles. Sharp, photorealistic, 8K detail. Square image 2048x2048.
```

## P2. Монтажная плата внутри: оцинкованная сталь (`zinc_plate`, 2048×2048, бесшовная, + height)

```
Seamless tileable top-down photograph of hot-dip galvanized steel mounting plate: bright silver-grey zinc with a visible spangle crystal pattern, extremely fine brushed micro-scratches, a few tiny dull oxidation patches, flat even soft diffuse light, no shadows, no holes, no screws, no objects, no text. All four edges continue each other perfectly so it tiles. Sharp, photorealistic. Square image 2048x2048.
```

## P3. DIN-рейка (`din_rail`, 1536×1024, фон #FF00FF)

Длина рейки в модели 1.21 м. Вырежу полосу по центру и растяну вдоль рейки, слева и справа узор должен стыковаться.

```
Photograph of a straight section of a standard 35 mm DIN top-hat mounting rail, galvanized steel, seen from directly above in strict orthographic view, running perfectly horizontally across the entire width of the image, occupying the central band of about 30 percent of the image height, with evenly spaced oblong mounting slots along its centerline, slightly worn bright zinc surface with fine scratches. The pattern repeats along its length so the left and right edges join seamlessly. Flat even soft light, no cast shadows. Isolated on a flat pure magenta background (#FF00FF) with nothing else in the frame. Image 1536x1024. No text, no watermark.
```

## P4. Латунь замка (`brass`, 1024×1024, бесшовная, + height)

```
Seamless tileable top-down texture of brushed antique brass, warm gold (#b8924f) with fine horizontal brushing lines, subtle darker oxidation specks and very faint fingerprints, flat even soft light, no reflections of objects, no hot highlights, no shadows, no text. All four edges continue each other perfectly so it tiles. Sharp, photorealistic. Square image 1024x1024.
```

## P5. Чёрный матовый пластик (`plastic_black`, 1024×1024, бесшовная, + height)

Рамка дисплея, кабельный ввод, тёмные реле, внутренняя сторона дверцы.

```
Seamless tileable top-down texture of matte black ABS plastic with a very fine leather-like grain, near-uniform dark charcoal (#1b1d1c), a few tiny dust particles, flat even soft light, no highlights, no shadows, no seams, no text. All four edges continue each other perfectly so it tiles. Sharp, photorealistic. Square image 1024x1024.
```

## P6. Бежевый матовый пластик (`plastic_beige`, 1024×1024, бесшовная, только цвет)

```
Seamless tileable top-down texture of matte off-white beige plastic (#d9d4c4) with a fine grain and a few tiny yellowed age spots, uniform soft diffuse light, no highlights, no shadows, no seams, no text. All four edges continue each other perfectly so it tiles. Sharp, photorealistic. Square image 1024x1024.
```

## P7. Наклейки дверцы (`door_decals`, 1536×1024, фон #FF00FF)

```
A sticker and nameplate sheet photographed flat and straight-on in strict orthographic view, evenly spaced with generous gaps, on a flat pure magenta background (#FF00FF): (1) a yellow (#e8c23a) equilateral warning triangle sticker with a thick black border and a black lightning bolt, slightly scuffed; (2) a blank white rectangular engraved nameplate with rounded corners and a thin black border, no letters; (3) a small round red-and-white high-voltage sticker with a black bolt, no letters; (4) a small green-and-yellow earth-ground symbol sticker, no letters; (5) a blank white rectangular sticker. Light wear and tiny scratches, flat even lighting, no shadows, no perspective. No text anywhere, no digits, no watermark. Image 1536x1024.
```

## P8. Лицевые панели автоматов (`breaker_faces`, 1536×1024, фон #FF00FF)

Шесть модулей в ряд, ширины 18 / 18 / 18 / 36 / 18 / 36 мм, высота 90 мм (в модели 0.07 / 0.07 / 0.07 / 0.11 / 0.07 / 0.11 м).

```
Front elevation in strict orthographic view of six modular DIN-rail circuit breakers standing side by side with no gaps, on a flat pure magenta background (#FF00FF). Module widths in the ratio 1 : 1 : 1 : 2 : 1 : 2 (narrow ones about 18 mm, wide ones 36 mm), all exactly the same height (90 mm). Colors: beige off-white (#d9d4c4) for modules 1, 2, 4 and 5, matte black (#2b2f2c) for modules 3 and 6. Each has a protruding rocker lever at the top-center (black on beige, grey on black), a small blank rectangular label window below it, a tiny blank rating plate with illegible marks only (no readable letters or digits), subtle vertical slits on the sides. Flat even soft light, no cast shadows, no perspective. The row is centered and fills about 90 percent of the image width. No text, no watermark. Image 1536x1024.
```

## P9. Бумажные бирки автоматов (`label_strips`, 1536×512, фон #FF00FF)

```
Flat photograph of a set of blank white paper label strips for circuit breakers, laid out as 8 narrow horizontal strips of different widths (roughly 18 to 36 mm wide and 8 mm tall), each strip carrying a short line of illegible pencil handwriting scribbles that are NOT real letters or digits, cream paper tone, tiny creases, strictly top-down view, flat even soft light, no shadows, on a flat pure magenta background (#FF00FF). Image 1536x512. No readable text, no watermark.
```

## P10. Схема на внутренней стороне дверцы (`schematic_sticker`, 1536×1024, на весь кадр)

```
Flat top-down scan of a laminated single-line electrical wiring diagram sticker for the inside of a distribution panel door: cream paper (#e8e1cc) with black and dark-blue line drawing (busbar, circuit breaker symbols, transformers, lamps), a thin boxed table in one corner, all text rendered only as tiny illegible marks (no real letters or numbers), slight yellowing, a few creases and worn corners. Landscape 3:2 ratio, the sticker fills the entire frame edge to edge, no background, no shadows, no perspective. Image 1536x1024.
```

## P11. Следы на стекле дисплея (`glass_smudge`, 1536×864, градации серого)

```
Grayscale reference map for a monitor glass surface: pure black background with faint white-grey fingerprints, dust specks, thin hairline scratches and a few soft diagonal streaks of wiping smears; low to medium contrast, nothing bright, no objects, no reflections of rooms or lights, no text. Image 1536x864 (16:9), grayscale only.
```

## P12. Маска царапин и потёртостей (`wear_mask`, 2048×2048, бесшовная, серая)

```
Seamless tileable grayscale mask of wear on painted metal: pure black background with white tiny paint chips, edge-wear speckles, thin scratches in random directions and a few short faint streaks; low density, mostly black; all four edges continue each other perfectly so it tiles; no objects, no text. Square image 2048x2048, grayscale only.
```

## P13. Загрязнение стены вокруг щитка, по желанию (`wall_grime`, 1536×1152, градации серого)

Нужен, чтобы щиток не выглядел «приклеенным». Сам шкаф не рисовать: внутри прямоугольника в центре чисто белое.

```
Grayscale soft-grime map for a wall around a wall-mounted metal box: white background; a rectangular dusty halo fading outward from a rectangular outline in the center (the box itself is NOT drawn, the inside of the rectangle is pure white), slightly darker dust and soot smudges near the upper corners, faint vertical rain-drip streaks running down from the bottom edge; subtle, low contrast, no text, no objects. Image 1536x1152 (4:3), grayscale only.
```

---

## Что куда пойдёт

| Файл | Деталь |
|---|---|
| P1 `steel_paint` | корпус и лицевая сторона дверцы |
| P2 `zinc_plate` | монтажная плата внутри |
| P3 `din_rail` | рейка |
| P4 `brass` | накладка и рычаг замка |
| P5 `plastic_black` | рамка дисплея, кабельный ввод, тёмные реле, обратная сторона дверцы |
| P6 `plastic_beige` | корпуса автоматов |
| P7 `door_decals` | наклейки на дверце (название допишу в коде) |
| P8 `breaker_faces` | лицевые панели автоматов |
| P9 `label_strips` | бумажные бирки |
| P10 `schematic_sticker` | схема на внутренней стороне дверцы |
| P11 `glass_smudge` | следы на стекле дисплея |
| P12 `wear_mask` | царапины и потёртости поверх всего |
| P13 `wall_grime` | загрязнение стены вокруг щитка |

## Что прислать обратно
Файлы `<имя>.png` (для P1, P2, P4, P5 ещё `<имя>_height.png`) положите в `public/textures/breaker_box/` или вставьте в рамки `ASSET_panel_…` в Figma. Если ChatGPT нарисует перспективу, тени или другой фон, просите: «перегенерируй: строго фронтальный вид без перспективы, без теней, фон ровный пурпурный #FF00FF».
