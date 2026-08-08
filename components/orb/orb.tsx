"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { VoiceLevels, VoiceUiState } from "@/lib/voice/types";
import styles from "./orb.module.css";

// [ambient periwinkle, accent, deep violet, core]
const PALETTES: Record<VoiceUiState, [string, string, string, string]> = {
  idle: ["#8b9af3", "#3ecfc4", "#7a6cf0", "#eef3ff"],
  connecting: ["#7d95f5", "#4f74f0", "#5f6cf0", "#e8eeff"],
  listening: ["#8b9af3", "#00e0cf", "#7a6cf0", "#f0fdfb"],
  speaking: ["#7fa5f5", "#38d6f0", "#6d7df2", "#ecfaff"],
  thinking: ["#6d86f2", "#4f74f0", "#4a55e8", "#e6ebff"],
  error: ["#f29b8e", "#f07a72", "#e5484d", "#fdeeec"],
};

// Rotation speed in degrees per second, damped in the rAF loop so state
// changes glide instead of snapping the animation phase
const SPIN_SPEED: Record<VoiceUiState, number> = {
  idle: 14,
  connecting: 36,
  listening: 20,
  speaking: 30,
  thinking: 105,
  error: 5,
};

interface OrbProps {
  state: VoiceUiState;
  getLevels: () => VoiceLevels;
  onClick: () => void;
}

export default function Orb({ state, getLevels, onClick }: OrbProps) {
  const pulseRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // One rAF loop drives audio swell and rotation directly: no React re-renders
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    let angle = 0;
    let speed = SPIN_SPEED.idle;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = stateRef.current;
      let level = 0;
      if (s === "speaking") {
        level = getLevels().output;
      } else if (s === "listening") {
        level = getLevels().input;
      }
      // Fast attack, slow release: the swell rises with speech but settles gently
      const factor = level > smooth ? 0.3 : 0.06;
      smooth += (level - smooth) * factor;

      speed += (SPIN_SPEED[s] - speed) * Math.min(dt * 2.5, 1);
      angle = (angle + speed * dt) % 360;

      const shell = pulseRef.current;
      if (shell) {
        shell.style.transform = `scale(${1 + smooth * 0.12})`;
      }
      const spin = spinRef.current;
      if (spin) {
        spin.style.transform = `rotate(${angle}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevels]);

  const p = PALETTES[state];
  const active = state !== "idle" && state !== "error";
  const label = active ? "Stop voice" : "Start voice";

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        ref={pulseRef}
        className={`${styles.shell} relative h-[38vmin] max-h-[380px] w-[38vmin] max-w-[380px]`}
        style={{ "--c1": p[0], "--c2": p[1], "--c3": p[2], "--c4": p[3] } as CSSProperties}
      >
        <div className={styles.aura} />
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={`${styles.orb} cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-8`}
        >
          <div className={styles.pulse}>
            <div ref={spinRef} className={styles.spin}>
              <div className={`${styles.layer} ${styles.ambient}`} />
              <div className={`${styles.layer} ${styles.accent}`} />
              <div className={`${styles.layer} ${styles.violet}`} />
            </div>
            <div className={`${styles.layer} ${styles.core}`} />
            <div className={`${styles.layer} ${styles.sheen}`} />
            <div className={`${styles.layer} ${styles.ribbon}`} />
          </div>
        </button>
      </div>
    </div>
  );
}
