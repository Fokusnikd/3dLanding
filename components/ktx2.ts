"use client";

import { use } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

// KTX2 (Basis): текстуры остаются сжатыми в видеопамяти (в 4–6 раз меньше, чем WebP после распаковки).
// Транскодер лежит в public/basis (копия three/examples/jsm/libs/basis).
const TRANSCODER_PATH = "/basis/";

let shared: KTX2Loader | null = null;

// Один загрузчик на весь рендерер (один пул воркеров транскодера): его же отдаём GLTFLoader (useGLTF).
export function getKtx2Loader(gl: THREE.WebGLRenderer): KTX2Loader {
  if (!shared) {
    shared = new KTX2Loader().setTranscoderPath(TRANSCODER_PATH).detectSupport(gl);
  }
  return shared;
}

const cache = new Map<string, Promise<THREE.CompressedTexture>>();

// Грузит .ktx2 как обычные текстуры (суспендит, как useTexture). У сжатых текстур нет flipY, поэтому файлы
// в public/textures закодированы уже перевёрнутыми по вертикали: вид и направление нормалей как у WebP.
export function useKtx2(urls: string[]): THREE.CompressedTexture[] {
  const loader = getKtx2Loader(useThree((s) => s.gl));
  return urls.map((url) => {
    let p = cache.get(url);
    if (!p) {
      p = loader.loadAsync(url);
      cache.set(url, p);
    }
    return use(p);
  });
}
