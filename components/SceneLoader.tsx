"use client";

import dynamic from "next/dynamic";

// WebGL-сцена грузится только на клиенте и не блокирует первый показ страницы
const Scene = dynamic(() => import("./Scene"), { ssr: false });

export default function SceneLoader() {
  return <Scene />;
}
