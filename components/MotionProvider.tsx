"use client";

import { MotionConfig } from "motion/react";

// reducedMotion="user" отключает transform-анимации, если в ОС включено «уменьшить движение»
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
