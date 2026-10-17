import * as THREE from "three";

// Рисует «картину» группы работ на canvas: тёмное полотно в стиле зала, костяная окантовка и гравированный рисунок
// цвета слоновой кости. Это заглушка вместо реальных работ: позже здесь можно грузить настоящие изображения.
const GOLD_LIGHT = "#f1ebdd";
const GOLD = "#cfc5ae";
const GOLD_DARK = "#8f8672";

type Art = { id: string; hues: [number, number] };

// aspect — пропорции рамы (ширина / высота), чтобы картина не растягивалась; у обычных 3:2, у длинной панорамы около 2.75
export function drawArt(group: Art, index: number, aspect = 1.5): HTMLCanvasElement {
  const w = 1200;
  const h = Math.round(w / aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const [h1, h2] = group.hues;

  // глубокий тёмный фон с приглушённым цветом группы и тёплым светом сверху, как под музейным прожектором
  g.fillStyle = "#0c0a08";
  g.fillRect(0, 0, w, h);
  const tint = g.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.75);
  tint.addColorStop(0, `hsla(${h1}, 34%, 24%, 0.95)`);
  tint.addColorStop(0.6, `hsla(${h1}, 30%, 12%, 0.7)`);
  tint.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
  const under = g.createRadialGradient(w * 0.9, h * 1.05, 0, w * 0.9, h * 1.05, w * 0.6);
  under.addColorStop(0, `hsla(${h2}, 40%, 22%, 0.6)`);
  under.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = under;
  g.fillRect(0, 0, w, h);
  const light = g.createLinearGradient(0, 0, 0, h);
  light.addColorStop(0, "rgba(255,226,176,0.12)");
  light.addColorStop(0.5, "rgba(255,226,176,0)");
  light.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = light;
  g.fillRect(0, 0, w, h);

  // переплетение холста
  g.lineWidth = 1;
  g.strokeStyle = "rgba(255,255,255,0.028)";
  g.beginPath();
  for (let x = 0; x < w; x += 3) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, h);
  }
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.beginPath();
  for (let y = 0; y < h; y += 3) {
    g.moveTo(0, y + 0.5);
    g.lineTo(w, y + 0.5);
  }
  g.stroke();

  // градиент слоновой кости для всех линий рисунка
  const gold = g.createLinearGradient(w * 0.2, h * 0.1, w * 0.8, h * 0.9);
  gold.addColorStop(0, GOLD_LIGHT);
  gold.addColorStop(0.45, GOLD);
  gold.addColorStop(0.7, GOLD_DARK);
  gold.addColorStop(1, "#e0d7c2");

  // двойная тонкая окантовка с угловыми «винтами»
  g.strokeStyle = gold;
  g.lineWidth = 4;
  g.strokeRect(34, 34, w - 68, h - 68);
  g.globalAlpha = 0.55;
  g.lineWidth = 1.5;
  g.strokeRect(50, 50, w - 100, h - 100);
  g.globalAlpha = 1;
  g.fillStyle = gold;
  for (const [x, y] of [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]]) {
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.fill();
  }

  // рисунок по центру: линии латуни с мягкой тенью, как гравировка
  g.save();
  g.translate(w / 2, h / 2 + 6);
  g.strokeStyle = gold;
  g.fillStyle = "rgba(207,197,174,0.06)";
  g.lineWidth = 5;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 14;
  g.shadowOffsetY = 5;
  const box = (x: number, y: number, bw: number, bh: number, r = 18, fill = false) => {
    g.beginPath();
    g.roundRect(x, y, bw, bh, r);
    if (fill) g.fill();
    g.stroke();
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  const dot = (x: number, y: number, r: number, fill = false) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      g.fillStyle = gold;
      g.fill();
      g.fillStyle = "rgba(207,197,174,0.06)";
    } else g.stroke();
  };

  if (group.id === "bigsalmon") {
    // CRM для сельхозкомпаний: таблица справочника и колос пшеницы
    box(-300, -230, 600, 460, 22, true);
    line(-300, -170, 300, -170);
    for (let i = 0; i < 3; i++) dot(-262 + i * 28, -200, 6, true);
    line(-40, -170, -40, 230);
    for (let i = 0; i < 5; i++) {
      const y = -120 + i * 70;
      line(-270, y, -70, y);
      g.lineWidth = 2.5;
      line(-270, y + 22, -120, y + 22);
      g.lineWidth = 5;
    }
    // колос: стебель и зёрна парами
    line(130, 200, 130, -110);
    for (let i = 0; i < 6; i++) {
      const y = -90 + i * 44;
      g.beginPath();
      g.ellipse(106, y, 12, 26, -0.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(154, y, 12, 26, 0.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    dot(130, -140, 14, true);
  } else if (group.id === "checkbox") {
    // платформа доставки: карта с маршрутом курьера и отметка выполненного заказа
    box(-300, -230, 600, 460, 22, true);
    g.lineWidth = 2.5;
    for (let i = 1; i < 5; i++) line(-300 + i * 120, -230, -300 + i * 120, 230);
    for (let i = 1; i < 4; i++) line(-300, -230 + i * 115, 300, -230 + i * 115);
    g.lineWidth = 5;
    const route: [number, number][] = [[-230, 150], [-110, 150], [-110, 30], [60, 30], [60, -110], [210, -110]];
    g.setLineDash([16, 14]);
    g.beginPath();
    route.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.stroke();
    g.setLineDash([]);
    dot(-230, 150, 14, true);
    dot(-110, 30, 9, true);
    dot(60, -110, 9, true);
    // метка назначения и галочка
    g.beginPath();
    g.arc(210, -150, 34, Math.PI * 0.85, Math.PI * 0.15);
    g.lineTo(210, -76);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(194, -152);
    g.lineTo(206, -138);
    g.lineTo(228, -166);
    g.stroke();
  } else if (group.id === "design") {
    // дизайн: кривая Безье с узлами и ручками пера, палитра и линейка
    g.beginPath();
    g.moveTo(-300, 150);
    g.bezierCurveTo(-210, -300, -10, 120, 120, -150);
    g.bezierCurveTo(260, -40, 300, -90, 300, -150);
    g.stroke();
    g.lineWidth = 2.5;
    for (const [x1, y1, x2, y2] of [[-300, 150, -210, -300], [-10, 120, 120, 150]] as const) {
      line(x1, y1, x2, y2);
      dot(x2, y2, 9);
    }
    g.lineWidth = 5;
    for (const [x, y] of [[-300, 150], [120, 150], [300, -150]] as const) {
      g.fillStyle = gold;
      g.fillRect(x - 12, y - 12, 24, 24);
    }
    g.fillStyle = "rgba(207,197,174,0.06)";
    // палитра: три пересекающихся круга
    for (let i = 0; i < 3; i++) dot(-200 + i * 62, 215, 44);
    // линейка с делениями
    box(60, 190, 260, 50, 6, true);
    for (let i = 0; i <= 10; i++) line(75 + i * 24, 190, 75 + i * 24, i % 5 === 0 ? 222 : 208);
  } else if (group.id === "interactive" && aspect > 2) {
    // панорама: три окна сервиса в ряд, данные «перетекают» слева направо (список → график → диаграмма)
    g.lineWidth = 4;
    box(-560, -135, 300, 270, 16, true);
    line(-560, -95, -260, -95);
    for (let i = 0; i < 3; i++) dot(-535 + i * 20, -115, 5, true);
    for (let i = 0; i < 4; i++) {
      const y = -60 + i * 44;
      dot(-525, y, 6, true);
      line(-500, y, -330 - (i % 2) * 30, y);
    }
    box(-190, -150, 380, 300, 18, true);
    line(-190, -108, 190, -108);
    for (let i = 0; i < 3; i++) dot(-165 + i * 20, -130, 5, true);
    const wbars = [0.35, 0.55, 0.45, 0.78, 0.62, 0.9, 0.7];
    wbars.forEach((v, i) => box(-150 + i * 47, 120 - 190 * v, 30, 190 * v, 3, true));
    g.beginPath();
    wbars.forEach((v, i) => {
      const x = -135 + i * 47;
      const y = 85 - 190 * v;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    wbars.forEach((v, i) => dot(-135 + i * 47, 85 - 190 * v, 6, true));
    box(260, -135, 300, 270, 16, true);
    line(260, -95, 560, -95);
    for (let i = 0; i < 3; i++) dot(285 + i * 20, -115, 5, true);
    dot(360, 10, 62);
    g.beginPath();
    g.arc(360, 10, 62, -Math.PI / 2, Math.PI * 0.55);
    g.lineWidth = 12;
    g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      line(450, -20 + i * 36, 535, -20 + i * 36);
      dot(440, -20 + i * 36, 5, true);
    }
    // связи между окнами
    g.setLineDash([10, 10]);
    line(-260, 0, -190, 0);
    line(190, 0, 260, 0);
    g.setLineDash([]);
  } else if (group.id === "interactive") {
    // интерактивный сервис: окно приложения с боковой панелью, столбиками и линией роста
    box(-300, -230, 600, 460, 22, true);
    line(-300, -170, 300, -170);
    for (let i = 0; i < 3; i++) dot(-262 + i * 28, -200, 6, true);
    line(-220, -140, -220, 215);
    for (let i = 0; i < 4; i++) line(-270, -110 + i * 44, -245, -110 + i * 44);
    const bars = [0.35, 0.55, 0.45, 0.78, 0.62, 0.9];
    bars.forEach((v, i) => {
      const bh = 280 * v;
      box(-170 + i * 70, 190 - bh, 42, bh, 4, true);
    });
    g.beginPath();
    bars.forEach((v, i) => {
      const x = -149 + i * 70;
      const y = 150 - 280 * v;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    bars.forEach((v, i) => dot(-149 + i * 70, 150 - 280 * v, 8, true));
  } else {
    // промо-сайты (freelance, лендинги): страница сайта: меню, крупный заголовок, кнопка, ряд карточек
    box(-210, -250, 420, 500, 22, true);
    line(-210, -190, 210, -190);
    dot(-175, -220, 7, true);
    for (let i = 0; i < 3; i++) line(60 + i * 44, -220, 85 + i * 44, -220);
    line(-160, -120, 120, -120);
    line(-160, -80, 60, -80);
    g.lineWidth = 2.5;
    line(-160, -35, 150, -35);
    line(-160, -10, 100, -10);
    g.lineWidth = 5;
    box(-160, 25, 140, 44, 22);
    dot(120, 70, 46);
    for (let i = 0; i < 3; i++) box(-160 + i * 112, 120, 96, 100, 10, true);
  }
  g.restore();

  // тонкое зерно и виньетка по краям
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const vig = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.72);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);

  // римская цифра раздела в левом верхнем углу
  g.fillStyle = gold;
  g.font = "500 30px Georgia, 'Times New Roman', serif";
  g.textAlign = "left";
  g.fillText(["I", "II", "III", "IV"][index] ?? String(index + 1), 78, 96);
  return canvas;
}

// Та же «картина» как 3D-текстура для рамы на стене
export function makeArt(project: { id: string; hues: [number, number] }, index: number, aspect = 1.5): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(drawArt(project, index, aspect));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Процедурная текстура стен: тёмный камень с лёгким шумом и вертикальными швами
export function makeWallTexture(): THREE.CanvasTexture {
  const s = 512;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#2c2e36";
  g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.fillRect(0, 0, 3, s); // шов
  g.fillStyle = "rgba(255,255,255,0.035)";
  g.fillRect(3, 0, 2, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Штукатурка: мягкие светлые и тёмные «облака» плюс мелкое зерно, чтобы стена не выглядела плоской заливкой.
// Облака рисуются с запасом по краям, поэтому текстура стыкуется без шва.
export function makePlasterTexture(base: string): THREE.CanvasTexture {
  const s = 512;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const g = canvas.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);

  for (let i = 0; i < 46; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = 40 + Math.random() * 130;
    const light = Math.random() < 0.5;
    for (const ox of [-s, 0, s]) {
      for (const oy of [-s, 0, s]) {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grad.addColorStop(0, light ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.12)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }

  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function finish(canvas: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function grain(g: CanvasRenderingContext2D, s: number, amount: number) {
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Фасадная кладка: плиты тёмного известняка «в перевязку», у каждой свой тон, пятна, фаски и швы.
// Одна текстура = 3 × 3 м (3 плиты в ряду, 6 рядов), поэтому швы стыкуются при повторе.
export function makeAshlarTexture(): THREE.CanvasTexture {
  const s = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#1a1816";
  g.fillRect(0, 0, s, s);
  const cols = 3;
  const rows = 6;
  const bw = s / cols;
  const bh = s / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : bw / 2;
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + off;
      const y = r * bh;
      const tone = 60 + Math.random() * 22;
      const warm = Math.random() * 6;
      g.fillStyle = `rgb(${tone + warm}, ${tone + warm * 0.6}, ${tone - 2})`;
      g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      // облака и прожилки внутри плиты
      for (let k = 0; k < 5; k++) {
        const cx = x + Math.random() * bw;
        const cy = y + Math.random() * bh;
        const rad = 30 + Math.random() * 90;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
        const light = Math.random() < 0.5;
        gr.addColorStop(0, light ? "rgba(255,245,230,0.07)" : "rgba(0,0,0,0.12)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.save();
        g.beginPath();
        g.rect(x + 3, y + 3, bw - 6, bh - 6);
        g.clip();
        g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        g.restore();
      }
      // фаска: светлая сверху-слева, тёмная снизу-справа
      g.fillStyle = "rgba(255,240,220,0.14)";
      g.fillRect(x + 3, y + 3, bw - 6, 3);
      g.fillRect(x + 3, y + 3, 3, bh - 6);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(x + 3, y + bh - 6, bw - 6, 3);
      g.fillRect(x + bw - 6, y + 3, 3, bh - 6);
    }
  }
  grain(g, s, 22);
  return finish(canvas);
}

// Дерево двери: вертикальные волокна тёмного ореха с редкими светлыми прожилками
export function makeWoodTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const base = g.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, "#3a2214");
  base.addColorStop(0.5, "#442818");
  base.addColorStop(1, "#38200f");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * w;
    const wob = Math.random() * 6;
    const phase = Math.random() * 6;
    g.strokeStyle = Math.random() < 0.3 ? `rgba(190,130,80,${0.05 + Math.random() * 0.09})` : `rgba(10,4,0,${0.08 + Math.random() * 0.18})`;
    g.lineWidth = 0.6 + Math.random() * 1.8;
    g.beginPath();
    for (let y = 0; y <= h; y += 16) {
      const xx = x + Math.sin(y * 0.012 + phase) * wob;
      if (y === 0) g.moveTo(xx, y);
      else g.lineTo(xx, y);
    }
    g.stroke();
  }
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return finish(canvas, false);
}

// Брусчатка перед входом: крупные плиты тёмного камня со швами. Одна текстура = 6 × 6 м (4 × 4 плиты).
export function makePavementTexture(): THREE.CanvasTexture {
  const s = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#0a0a0b";
  g.fillRect(0, 0, s, s);
  const n = 4;
  const b = s / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const t = 34 + Math.random() * 16;
      g.fillStyle = `rgb(${t}, ${t + 1}, ${t + 4})`;
      g.fillRect(c * b + 3, r * b + 3, b - 6, b - 6);
      const gr = g.createLinearGradient(c * b, r * b, c * b + b, r * b + b);
      gr.addColorStop(0, "rgba(255,255,255,0.05)");
      gr.addColorStop(1, "rgba(0,0,0,0.1)");
      g.fillStyle = gr;
      g.fillRect(c * b + 3, r * b + 3, b - 6, b - 6);
    }
  }
  grain(g, s, 20);
  return finish(canvas);
}

// Паркет тёмного ореха «корзинкой»: блоки из четырёх досок, направление чередуется в шахматном порядке
export function makeParquetTexture(): THREE.CanvasTexture {
  const s = 1024;
  const block = 128;
  const plank = 32;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#120b07";
  g.fillRect(0, 0, s, s);

  for (let by = 0; by < s / block; by++) {
    for (let bx = 0; bx < s / block; bx++) {
      const horizontal = (bx + by) % 2 === 0;
      for (let p = 0; p < block / plank; p++) {
        const x = horizontal ? bx * block : bx * block + p * plank;
        const y = horizontal ? by * block + p * plank : by * block;
        const w = horizontal ? block : plank;
        const h = horizontal ? plank : block;
        const hue = 22 + Math.random() * 8;
        const sat = 34 + Math.random() * 14;
        const light = 13 + Math.random() * 10;
        g.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
        g.fillRect(x, y, w, h);
        // волокна дерева
        g.strokeStyle = "rgba(0, 0, 0, 0.16)";
        g.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          if (horizontal) {
            const yy = y + 4 + Math.random() * (h - 8);
            g.moveTo(x, yy);
            g.lineTo(x + w, yy + (Math.random() - 0.5) * 3);
          } else {
            const xx = x + 4 + Math.random() * (w - 8);
            g.moveTo(xx, y);
            g.lineTo(xx + (Math.random() - 0.5) * 3, y + h);
          }
          g.stroke();
        }
        // тёмный шов между досками
        g.strokeStyle = "rgba(0, 0, 0, 0.62)";
        g.lineWidth = 2;
        g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
