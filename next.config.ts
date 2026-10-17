import type { NextConfig } from "next";

// На GitHub Pages сайт отдаётся из подпапки репозитория; значение задаёт workflow.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // drei <Html> в dev-режиме Strict Mode даёт ошибку «unmount a root while rendering» (в проде её нет)
  reactStrictMode: false,
  devIndicators: false,
};

export default nextConfig;
