"use client";

import { useEffect, useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

const FONT = "Georgia, 'Times New Roman', serif";
const BRASS = "#c9a45e";
const DEPTH = 0.03; // толщина пластины

// Объёмная латунная табличка: скошенная пластина, гравированный текст (bumpMap), четыре винта по углам.
// Лицевая сторона смотрит в +z родителя. Заголовок переносится по словам и подбирается максимально крупным;
// sub (необязательная подпись) выводится внизу разрядкой.
export default function BrassPlate({
  title,
  sub = "",
  pos,
  w,
  h,
}: {
  title: string;
  sub?: string;
  pos: [number, number, number];
  w: number;
  h: number;
}) {
  const spaced = sub.toUpperCase().split("").join(" ");
  const { map, bump } = useMemo(() => {
    const cw = 1000;
    const ch = Math.round((cw * h) / w);
    const make = (engrave: boolean) => {
      const cv = document.createElement("canvas");
      cv.width = cw;
      cv.height = ch;
      const g = cv.getContext("2d")!;
      if (engrave) {
        // карта высот: светлое — выше, поэтому фон белый, а текст и рамка тёмные (врезаны)
        g.fillStyle = "#fff";
        g.fillRect(0, 0, cw, ch);
        g.fillStyle = "#000";
        g.strokeStyle = "#000";
      } else {
        const gr = g.createLinearGradient(0, 0, cw, ch);
        gr.addColorStop(0, "#e2c283");
        gr.addColorStop(0.5, "#cfaa65");
        gr.addColorStop(1, "#dcba78");
        g.fillStyle = gr;
        g.fillRect(0, 0, cw, ch);
        // почти чёрный текст на светлой латуни — максимальный контраст
        g.fillStyle = "#170e03";
        g.strokeStyle = "rgba(23,14,3,0.85)";
      }
      g.lineWidth = 6;
      g.strokeRect(22, 22, cw - 44, ch - 44);
      g.lineWidth = 2;
      g.strokeRect(34, 34, cw - 68, ch - 68);
      g.textAlign = "center";
      g.textBaseline = "middle";

      const maxW = cw - 150;
      const areaH = ch - 130 - (sub ? 70 : 0);
      const words = title.split(" ");
      const wrap = (size: number) => {
        g.font = `700 ${size}px ${FONT}`;
        const out: string[] = [];
        let cur = "";
        for (const word of words) {
          const next = cur ? `${cur} ${word}` : word;
          if (cur && g.measureText(next).width > maxW) {
            out.push(cur);
            cur = word;
          } else {
            cur = next;
          }
        }
        out.push(cur);
        return out;
      };
      // самый крупный кегль, при котором слова не вылезают по ширине и строки помещаются по высоте
      let size = 150;
      let lines = wrap(size);
      while (
        size > 24 &&
        (lines.length * size * 1.15 > areaH || lines.some((l) => g.measureText(l).width > maxW))
      ) {
        size -= 2;
        lines = wrap(size);
      }
      const lh = size * 1.15;
      const top = 62 + (areaH - lines.length * lh) / 2 + lh / 2;
      lines.forEach((l, i) => g.fillText(l, cw / 2, top + i * lh));
      if (sub) {
        g.font = `400 42px ${FONT}`;
        g.fillText(spaced, cw / 2, ch - 78);
      }
      const t = new THREE.CanvasTexture(cv);
      t.anisotropy = 8;
      if (!engrave) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { map: make(false), bump: make(true) };
  }, [title, sub, spaced, w, h]);
  useEffect(
    () => () => {
      map.dispose();
      bump.dispose();
    },
    [map, bump],
  );

  const sx = w / 2 - 0.035;
  const sy = h / 2 - 0.035;
  return (
    <group position={pos}>
      <RoundedBox args={[w, h, DEPTH]} radius={0.008} smoothness={3} position={[0, 0, DEPTH / 2]} castShadow receiveShadow>
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.35} />
      </RoundedBox>
      <mesh position={[0, 0, DEPTH + 0.0006]}>
        <planeGeometry args={[w - 0.012, h - 0.012]} />
        <meshStandardMaterial
          map={map}
          bumpMap={bump}
          bumpScale={1.5}
          emissiveMap={map}
          emissive="#ffffff"
          emissiveIntensity={0.55}
          metalness={0.1}
          roughness={0.6}
        />
      </mesh>
      {[-1, 1].flatMap((ix) =>
        [-1, 1].map((iy) => (
          <mesh key={`${ix}${iy}`} position={[ix * sx, iy * sy, DEPTH + 0.006]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.009, 0.009, 0.012, 16]} />
            <meshStandardMaterial color="#8c6a30" metalness={1} roughness={0.3} />
          </mesh>
        )),
      )}
    </group>
  );
}
