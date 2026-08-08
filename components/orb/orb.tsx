"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { VoiceLevels, VoiceUiState } from "@/lib/voice/types";
import { coreVertex, coreFragment, glowVertex, glowFragment } from "./shaders";

export const ORB_COLORS: Record<VoiceUiState | "success", THREE.Color> = {
  idle: new THREE.Color("#10b5a3"),
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
  ringSpeed: number;
}

function targetsFor(state: VoiceUiState, level: number, elapsed: number): OrbTargets {
  if (state === "connecting") {
    return { distort: 0.1, speed: 0.6, brightness: 0.6, ringSpeed: 0.6 };
  }
  if (state === "listening") {
    return {
      distort: 0.08 + level * 0.25,
      speed: 0.3,
      brightness: 0.7 + level * 0.4,
      ringSpeed: 0.25,
    };
  }
  if (state === "speaking") {
    return {
      distort: 0.1 + level * 0.45,
      speed: 0.5,
      brightness: 0.8 + level * 0.6,
      ringSpeed: 0.4,
    };
  }
  if (state === "thinking") {
    return { distort: 0.2, speed: 1.4, brightness: 0.65, ringSpeed: 2.2 };
  }
  if (state === "error") {
    return { distort: 0.03, speed: 0.1, brightness: 0.5, ringSpeed: 0.05 };
  }
  const breathe = Math.sin(elapsed * 0.5) * 0.02;
  return { distort: 0.05, speed: 0.15, brightness: 0.35 + breathe, ringSpeed: 0.1 };
}

function makeStarField(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Scatter in a slab behind the orb so no star gets close to the camera
    positions[i * 3] = (Math.random() * 2 - 1) * 12;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * 8;
    positions[i * 3 + 2] = -2 - Math.random() * 10;
  }
  return positions;
}

interface OrbSceneProps {
  state: VoiceUiState;
  getLevels: () => VoiceLevels;
}

function OrbScene({ state, getLevels }: OrbSceneProps) {
  const elapsedRef = useRef(0);
  const coreMatRef = useRef<THREE.ShaderMaterial>(null);
  const glowMatRef = useRef<THREE.ShaderMaterial>(null);
  const ringSpeedRef = useRef(0.1);
  const ringAMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringBMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringARef = useRef<THREE.Mesh>(null);
  const ringBRef = useRef<THREE.Mesh>(null);
  const starsRef = useRef<THREE.Points>(null);
  const starMatRef = useRef<THREE.PointsMaterial>(null);

  const starPositions = useMemo(() => makeStarField(420), []);

  const coreUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: ORB_COLORS.idle.clone() },
      uDistort: { value: 0.05 },
      uSpeed: { value: 0.15 },
      uBrightness: { value: 0.35 },
      uLevel: { value: 0 },
      uNoiseScale: { value: 1.5 },
    }),
    []
  );

  const glowUniforms = useMemo(
    () => ({
      uColor: { value: ORB_COLORS.idle.clone() },
      uBrightness: { value: 0.15 },
    }),
    []
  );

  useFrame((_, delta) => {
    const coreMat = coreMatRef.current;
    const glowMat = glowMatRef.current;
    if (!coreMat || !glowMat) return;
    elapsedRef.current += delta;
    const levels = getLevels();
    let level = 0;
    if (state === "speaking") {
      level = levels.output;
    } else if (state === "listening") {
      level = levels.input;
    }

    const target = targetsFor(state, level, elapsedRef.current);
    const u = coreMat.uniforms as typeof coreUniforms;
    u.uDistort.value = THREE.MathUtils.damp(u.uDistort.value, target.distort, 4, delta);
    u.uSpeed.value = THREE.MathUtils.damp(u.uSpeed.value, target.speed, 4, delta);
    u.uBrightness.value = THREE.MathUtils.damp(u.uBrightness.value, target.brightness, 4, delta);
    u.uLevel.value = THREE.MathUtils.damp(u.uLevel.value, level, 8, delta);
    u.uColor.value.lerp(ORB_COLORS[state], 0.06);
    u.uTime.value += delta * u.uSpeed.value;

    const g = glowMat.uniforms as typeof glowUniforms;
    g.uColor.value.copy(u.uColor.value);
    // Halo stays fully saturated on the light background; brightness only nudges it
    g.uBrightness.value = 0.95 + u.uBrightness.value * 0.15;

    ringSpeedRef.current = THREE.MathUtils.damp(ringSpeedRef.current, target.ringSpeed, 3, delta);
    const ringOpacity = 0.25 + u.uBrightness.value * 0.3;
    if (ringARef.current && ringAMatRef.current) {
      ringARef.current.rotation.z += delta * ringSpeedRef.current;
      ringAMatRef.current.color.copy(u.uColor.value);
      ringAMatRef.current.opacity = ringOpacity;
    }
    if (ringBRef.current && ringBMatRef.current) {
      ringBRef.current.rotation.z -= delta * ringSpeedRef.current * 0.7;
      ringBMatRef.current.color.copy(u.uColor.value);
      ringBMatRef.current.opacity = ringOpacity * 0.7;
    }
    if (starsRef.current && starMatRef.current) {
      starsRef.current.rotation.y += delta * 0.008;
      starMatRef.current.opacity = 0.25 + u.uBrightness.value * 0.2;
    }
  });

  return (
    <>
      <mesh>
        <icosahedronGeometry args={[1, 48]} />
        <shaderMaterial
          ref={coreMatRef}
          vertexShader={coreVertex}
          fragmentShader={coreFragment}
          uniforms={coreUniforms}
        />
      </mesh>
      <mesh scale={1.25}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          ref={glowMatRef}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
        />
      </mesh>

      <mesh ref={ringARef} rotation={[1.25, 0.2, 0]}>
        <torusGeometry args={[1.55, 0.004, 8, 200]} />
        <meshBasicMaterial ref={ringAMatRef} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh ref={ringBRef} rotation={[1.05, -0.35, 0]}>
        <torusGeometry args={[1.85, 0.003, 8, 200]} />
        <meshBasicMaterial ref={ringBMatRef} transparent opacity={0.25} depthWrite={false} />
      </mesh>

      <points ref={starsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={starMatRef}
          size={0.02}
          sizeAttenuation
          color="#6fa39d"
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </points>

      <EffectComposer>
        {/* Threshold sits above the light background's luminance so only HDR vein
            highlights bloom; lower values make the background itself bloom, which
            reads as a grey shadow ring around the orb */}
        <Bloom mipmapBlur intensity={0.7} luminanceThreshold={1.2} luminanceSmoothing={0.05} />
        <Vignette eskil={false} offset={0.1} darkness={0.15} />
      </EffectComposer>
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
    <div className="absolute inset-0">
      <Canvas
        gl={{ antialias: true }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 6], fov: 45 }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color("#f2f7f7");
        }}
      >
        <OrbScene state={state} getLevels={getLevels} />
      </Canvas>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="absolute left-1/2 top-1/2 h-[36vmin] w-[36vmin] max-h-[360px] max-w-[360px] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
      />
    </div>
  );
}
