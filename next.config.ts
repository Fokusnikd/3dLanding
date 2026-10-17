import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // drei <Html> в dev-режиме Strict Mode даёт ошибку «unmount a root while rendering» (в проде её нет)
  reactStrictMode: false,
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
