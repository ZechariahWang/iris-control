"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VoiceLevels, VoiceUiState } from "@/lib/voice/types";
import { blobVertex, blobFragment } from "./shaders";

export const ORB_COLORS: Record<VoiceUiState | "success", THREE.Color> = {
  idle: new THREE.Color("#3ecfc4"),
  connecting: new THREE.Color("#3b82f6"),
  listening: new THREE.Color("#00f0d4"),
  speaking: new THREE.Color("#29e4f5"),
  thinking: new THREE.Color("#2563eb"),
  error: new THREE.Color("#e5484d"),
  success: new THREE.Color("#16a34a"),
};

interface OrbTargets {
  distort: number;
  speed: number;
  brightness: number;
}

function targetsFor(state: VoiceUiState, level: number, elapsed: number): OrbTargets {
  if (state === "connecting") {
    return { distort: 0.14, speed: 0.6, brightness: 0.85 };
  }
  if (state === "listening") {
    return { distort: 0.14 + level * 0.2, speed: 0.35, brightness: 0.95 + level * 0.3 };
  }
  if (state === "speaking") {
    return { distort: 0.16 + level * 0.3, speed: 0.55, brightness: 1.0 + level * 0.4 };
  }
  if (state === "thinking") {
    return { distort: 0.24, speed: 1.3, brightness: 0.9 };
  }
  if (state === "error") {
    return { distort: 0.06, speed: 0.12, brightness: 0.8 };
  }
  const breathe = Math.sin(elapsed * 0.4) * 0.03;
  return { distort: 0.11, speed: 0.18, brightness: 0.95 + breathe };
}

// Three translucent gradient layers melt into one fluid blob under the canvas blur
const LAYERS = [
  { scale: 1.12, tint: "#8296f4", alpha: 0.45, phase: 0.0, offset: [0.06, -0.04, 0] },
  { scale: 0.88, tint: "#6a74ee", alpha: 0.6, phase: 2.3, offset: [-0.08, 0.05, 0.1] },
  { scale: 0.66, tint: "#eef1ff", alpha: 0.85, phase: 4.1, offset: [0.12, 0.1, 0.2] },
] as const;

function makeLayerUniforms(tint: string, alpha: number, phase: number) {
  return {
    uTime: { value: 0 },
    uColor: { value: ORB_COLORS.idle.clone() },
    uTint: { value: new THREE.Color(tint) },
    uDistort: { value: 0.11 },
    uBrightness: { value: 0.78 },
    uLevel: { value: 0 },
    uAlpha: { value: alpha },
    uNoiseScale: { value: 1.1 },
    uPhase: { value: phase },
  };
}

interface OrbSceneProps {
  state: VoiceUiState;
  getLevels: () => VoiceLevels;
}

function OrbScene({ state, getLevels }: OrbSceneProps) {
  const elapsedRef = useRef(0);
  const speedRef = useRef(0.18);
  const matRefs = useRef<(THREE.ShaderMaterial | null)[]>([null, null, null]);
  const layerUniforms = useMemo(
    () => LAYERS.map((l) => makeLayerUniforms(l.tint, l.alpha, l.phase)),
    []
  );

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const levels = getLevels();
    let level = 0;
    if (state === "speaking") {
      level = levels.output;
    } else if (state === "listening") {
      level = levels.input;
    }
    const target = targetsFor(state, level, elapsedRef.current);
    speedRef.current = THREE.MathUtils.damp(speedRef.current, target.speed, 3, delta);

    for (const mat of matRefs.current) {
      if (!mat) continue;
      const u = mat.uniforms as ReturnType<typeof makeLayerUniforms>;
      u.uDistort.value = THREE.MathUtils.damp(u.uDistort.value, target.distort, 4, delta);
      u.uBrightness.value = THREE.MathUtils.damp(u.uBrightness.value, target.brightness, 4, delta);
      u.uLevel.value = THREE.MathUtils.damp(u.uLevel.value, level, 8, delta);
      u.uColor.value.lerp(ORB_COLORS[state], 0.05);
      u.uTime.value += delta * speedRef.current;
    }
  });

  return (
    <>
      {LAYERS.map((layer, i) => (
        <mesh
          key={layer.phase}
          scale={layer.scale}
          position={[...layer.offset] as [number, number, number]}
        >
          <icosahedronGeometry args={[1, 48]} />
          <shaderMaterial
            ref={(m) => {
              matRefs.current[i] = m;
            }}
            vertexShader={blobVertex}
            fragmentShader={blobFragment}
            uniforms={layerUniforms[i]}
            transparent
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

interface OrbProps {
  state: VoiceUiState;
  getLevels: () => VoiceLevels;
  onClick: () => void;
}

export default function Orb({ state, getLevels, onClick }: OrbProps) {
  const active = state !== "idle" && state !== "error";
  const label = active ? "Stop voice" : "Start voice";

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-[80vmin] max-h-[720px] w-[80vmin] max-w-[720px]">
        <Canvas
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          camera={{ position: [0, 0, 6], fov: 45 }}
        >
          <OrbScene state={state} getLevels={getLevels} />
        </Canvas>
      </div>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="absolute left-1/2 top-1/2 h-[36vmin] w-[36vmin] max-h-[360px] max-w-[360px] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
      />
    </div>
  );
}
