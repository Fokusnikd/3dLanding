import Nav from "@/components/Nav";
import { jobs, profile, showcase } from "@/lib/content";

export default function Home() {
  return (
    <>
      <Nav />
      {/* Страница не прокручивается: колесо, тачпад, свайп и клавиши ведут камеру (см. components/controls.ts) */}
      <main id="top">
        {/* Текстовая версия для поисковиков и скринридеров: видимый контент живёт в 3D-сцене */}
        <div className="sr-only">
          <h1>
            {profile.name} — {profile.role}
          </h1>
          <p>{profile.intro}</p>
          <ul>
            {jobs.map((j) => (
              <li key={j.id}>
                {j.company} ({j.period}) — {j.role}, {j.product}. {j.summary}
                <ul>
                  {j.tasks.map((t) => (
                    <li key={t.text}>{t.text}</li>
                  ))}
                </ul>
                <p>Стек: {j.stack.join(", ")}</p>
              </li>
            ))}
          </ul>
          <ul>
            {showcase.map((g) => (
              <li key={g.id}>
                {g.title} — {g.blurb}
              </li>
            ))}
          </ul>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
        </div>
      </main>
    </>
  );
}
