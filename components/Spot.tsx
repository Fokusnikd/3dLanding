"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Props = {
  pos: [number, number, number];
  aim: [number, number, number];
  intensity?: number;
  angle?: number;
  shadow?: boolean; // отбрасывает ли мягкие тени (дороже по производительности)
  fixture?: boolean; // рисовать ли сам светильник — латунный цилиндр на потолке
  beam?: boolean; // видимый конус света
  color?: string;
};

// Тёплый музейный прожектор, направленный на точку: свет, при желании тень, светильник и луч
export default function Spot({ pos, aim, intensity = 70, angle = 0.55, shadow = false, fixture = true, beam = false, color = "#ffe2b8" }: Props) {
  const [ax, ay, az] = aim;
  const [px, py, pz] = pos;
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.set(ax, ay, az);

  // светильник и луч поворачиваем в сторону цели (у Object3D.lookAt ось +z смотрит на цель)
  const lamp = useRef<THREE.Group>(null);
  useEffect(() => {
    lamp.current?.lookAt(ax, ay, az);
  }, [ax, ay, az]);
  const len = useMemo(() => Math.hypot(ax - px, ay - py, az - pz), [ax, ay, az, px, py, pz]);

  return (
    <>
      <spotLight
        position={pos}
        angle={angle}
        penumbra={0.9}
        intensity={intensity}
        decay={2}
        color={color}
        target={target}
        castShadow={shadow}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
      />
      <primitive object={target} />
      {(fixture || beam) && (
        <group ref={lamp} position={pos}>
          {fixture && (
            <>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.1, 0.13, 0.3, 20]} />
                <meshStandardMaterial color="#b8924f" metalness={1} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0, 0.152]}>
                <circleGeometry args={[0.095, 20]} />
                <meshBasicMaterial color="#ffe6b8" toneMapped={false} />
              </mesh>
            </>
          )}
          {beam && (
            <mesh position={[0, 0, len / 2]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[Math.tan(angle) * len * 0.6, len, 32, 1, true]} />
              <meshBasicMaterial
                color="#ffdca0"
                transparent
                opacity={0.05}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </group>
      )}
    </>
  );
}
