# Заказ для ChatGPT: настоящие колонны фасада

Колонны стоят на стыках фасада (по одной слева и справа от двери), высота ≈ 10 м, толщина ≈ 1 м.
Сейчас они сгенерированы кодом и выглядят «пластиково». Нужны три картинки, которые я натяну на 3D-модель.
Фасад: светлый тёплый серо-бежевый известняк/штукатурка, петербургский/парижский неоклассицизм XIX века.

Общие правила для всех трёх (вставляйте в начало каждого запроса или в «инструкции чата»):
- Режим: изображение, а не рисунок и не иллюстрация. Фотореализм, как фото реального камня.
- Освещение ровное, рассеянное, без резких теней и бликов (свет я добавлю в 3D сам).
- Без людей, текста, надписей, рамок и водяных знаков.
- Один и тот же камень на всех трёх картинах: светлый тёплый серо-бежевый известняк, лёгкая патина, мелкие поры, тонкие трещинки, местами следы дождя.

---

## 1. Ствол — бесшовная текстура (файл `shaft.png`, 1024×1024)

```
Photorealistic seamless tileable texture of a fluted classical stone column shaft, flattened as if the cylinder surface were unrolled onto a flat plane. Straight-on orthographic view, perfectly vertical flutes (concave grooves), 7 flutes fully visible across the width, separated by narrow flat ridges (arrises). Warm light grey-beige weathered limestone, fine pores, subtle hairline cracks, slight rain streaks, light patina. Even soft diffuse lighting, no strong shadows, no perspective, no highlights. The texture must tile seamlessly left-right and top-bottom. Square image 1024x1024. No text, no watermark.
```

## 2. База колонны — вид спереди (файл `base.png`, 1536×1024)

```
Photorealistic front elevation of the base of a classical Attic-style stone column (square plinth at the bottom, then a large torus, a scotia groove and a smaller torus, topped by the start of a fluted shaft). Perfectly straight-on orthographic view, perfectly symmetrical, no perspective distortion, horizontal edges exactly horizontal. The base is about 1.4 units wide and 0.5 units tall; the shaft stub above is about the same height again. Warm light grey-beige weathered limestone, fine pores, hairline cracks, light patina, subtle rain streaks. Even soft diffuse lighting from the front, no cast shadows, no strong highlights. Isolated on a flat pure magenta background (#FF00FF) with nothing else in the frame. Image 1536x1024. No text, no watermark.
```

## 3. Капитель — вид спереди (файл `capital.png`, 1536×1024)

```
Photorealistic front elevation of an Ionic stone column capital with two carved volutes (scrolls), echinus with egg-and-dart ornament, a narrow neck of the fluted shaft below it, and a flat abacus on top. Perfectly straight-on orthographic view, perfectly symmetrical, no perspective distortion, horizontal edges exactly horizontal. The capital is about 1.4 units wide and 0.55 units tall including the abacus; show a bit of fluted shaft below it. Warm light grey-beige weathered limestone, fine pores, hairline cracks, light patina, subtle rain streaks. Even soft diffuse lighting from the front, no cast shadows, no strong highlights. Isolated on a flat pure magenta background (#FF00FF) with nothing else in the frame. Image 1536x1024. No text, no watermark.
```

---

## Что прислать обратно
Положите три файла в `public/facade/kit/columns/` (или просто пришлите в чат):
`shaft.png`, `base.png`, `capital.png`.

Если ChatGPT нарисует колонну в перспективе, с тенями или на другом фоне, просите «перегенерируй: строго фронтальный вид без перспективы, фон ровный пурпурный #FF00FF».
Проверить, что нужное получилось: ствол должен стыковаться сам с собой при повторе (положите две копии рядом и посмотрите на шов).
