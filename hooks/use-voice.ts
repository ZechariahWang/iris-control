"use client";

import { useEffect, useRef, useState } from "react";
import { startVoice } from "@/lib/voice/engine";
import type { UseVoiceResult, VoiceEngine, VoiceLevels, VoiceUiState } from "@/lib/voice/types";

const ZERO_LEVELS: VoiceLevels = { input: 0, output: 0 };

export function useVoice(opts: { onExchange: (task: string, reply: string) => void }): UseVoiceResult {
  const [state, setState] = useState<VoiceUiState>("idle");
  const [statusText, setStatusText] = useState("");
  const stateRef = useRef<VoiceUiState>("idle");
  const engineRef = useRef<VoiceEngine | null>(null);
  const intervalRef = useRef<number | null>(null);
  const genRef = useRef(0);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  function setUi(next: VoiceUiState) {
    if (stateRef.current !== next) {
      stateRef.current = next;
      setState(next);
    }
  }

  function stopEngine() {
    genRef.current++;
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
  }

  async function start() {
    const gen = genRef.current;
    try {
      const engine = await startVoice({
        onStatus: (text) => setStatusText(text),
        onState: (s) => {
          if (s === "disconnected") {
            if (stateRef.current !== "error") setUi("idle");
          } else {
            setUi(s);
          }
        },
        onExchange: (task, reply) => optsRef.current.onExchange(task, reply),
        onError: (text) => {
          setStatusText(text);
          setUi("error");
        },
      });
      if (gen !== genRef.current) {
        engine.stop();
        return;
      }
      engineRef.current = engine;
      intervalRef.current = window.setInterval(() => {
        const e = engineRef.current;
        if (!e) return;
        const speaking = e.isSpeaking();
        if (speaking && stateRef.current === "listening") {
          setUi("speaking");
        } else if (!speaking && stateRef.current === "speaking") {
          setUi("listening");
        }
      }, 100);
    } catch (e) {
      if (gen !== genRef.current) return;
      setStatusText((e as Error).message || String(e));
      setUi("error");
    }
  }

  function toggle() {
    if (stateRef.current === "idle" || stateRef.current === "error") {
      stopEngine();
      setStatusText("");
      setUi("connecting");
      void start();
    } else {
      stopEngine();
      setStatusText("");
      setUi("idle");
    }
  }

  function getLevels(): VoiceLevels {
    const engine = engineRef.current;
    if (engine) return engine.getLevels();
    return ZERO_LEVELS;
  }

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- generation counter, latest value is intended
      genRef.current++;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, []);

  return { state, statusText, toggle, getLevels };
}
