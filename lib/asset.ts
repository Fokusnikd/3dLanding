// Префикс для статики: на GitHub Pages сайт живёт в подпапке (/3dLanding), локально — в корне.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const asset = (path: string) => `${BASE_PATH}${path}`;
