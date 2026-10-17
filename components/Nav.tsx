"use client";

import { useState } from "react";
import { motion, useMotionValueEvent } from "motion/react";
import { motionTokens, reveal, springs } from "@/lib/motion-tokens";
import { profile } from "@/lib/content";
import { api, uValue } from "./controls";

// stop — остановка камеры, к которой едем по клику; stops — на каких остановках пункт считается активным
const links = [
  { id: "works", label: "Работы", stop: 1, stops: [1] },
  { id: "stack", label: "Стек", stop: 2, stops: [2] },
  { id: "portfolio", label: "Портфолио", stop: 3, stops: [3] },
  { id: "contact", label: "Контакты", stop: 4, stops: [4] },
];

export default function Nav() {
  const [active, setActive] = useState("");

  useMotionValueEvent(uValue, "change", (u) => {
    // во второй половине выхода камера уже развернулась к первому экрану
    const stop = u > 4.5 ? 0 : Math.round(u);
    const hit = links.find((l) => l.stops.includes(stop))?.id ?? "";
    setActive((cur) => (cur === hit ? cur : hit));
  });

  return (
    <motion.header
      className="nav"
      initial={{ opacity: 0, y: -motionTokens.distance.lg }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...reveal, delay: 0.1 }}
    >
      <nav className="nav-pill glass" aria-label="Основная навигация">
        <a
          href="#top"
          className="nav-brand"
          onClick={(e) => {
            e.preventDefault();
            api.goTo(0);
          }}
        >
          {profile.name}
        </a>
        <ul>
          {links.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                className={active === l.id ? "is-active" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  api.goTo(l.stop);
                }}
              >
                {active === l.id && <motion.span layoutId="nav-pill" className="nav-active" transition={springs.snappy} />}
                <span className="nav-label">{l.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </motion.header>
  );
}
