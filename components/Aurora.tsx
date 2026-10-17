// Фон — плоский почти чёрный цвет (задан на body). Здесь только очень лёгкое зерно.
// Единственный источник света (тёплое пятно за атомом) живёт в слое сцены, см. Scene.tsx.
export default function Aurora() {
  return <div className="grain" aria-hidden />;
}
