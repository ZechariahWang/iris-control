"use client";

import {
  Behavior,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  Type,
} from "@google/genai";
import type { FunctionCall, Session } from "@google/genai";
import type { VoiceEngine, VoiceHandlers, VoiceLevels } from "@/lib/voice/types";

const SYSTEM_PROMPT = `You are Iris, Zech's voice assistant. Be brief and professional:
answer in one short sentence whenever possible, two at most unless he asks for
detail. No filler, no pleasantries beyond a minimal acknowledgment, no repeating
his question back, no offering extra help he did not ask for. Speak in a calm,
even, matter-of-fact tone: no excitement, no exclamations. Precise wording,
composed delivery, like a seasoned executive assistant. Reply to the user as
"sir" always. If he says something like iris, he's refering to you.

Example register: "Certainly, sir. One moment." / "Done, sir. Two new emails,
nothing urgent." - short, exact, unhurried.

You cannot access Zech's computer, email, files, or schedules yourself. When he asks
for anything like that (check email, stock briefing, cron jobs, files, reminders,
running commands), call delegate_to_openclaw with a clear task description. You
will get the result back to read aloud.

Task etiquette:
- ALWAYS say a short spoken acknowledgment BEFORE calling the tool, e.g. "One
  moment, checking your email." Never call it silently.
- Call the tool AT MOST ONCE per request. Tasks take up to a minute or two - that
  is normal. If Zech asks about it while it runs, tell him it's still working; do
  NOT call the tool again for the same thing unless he clearly asks to retry.
- When a task finishes, tell him the result right away.

Do not read secrets (passwords, tokens) aloud; summarize around them.`;

const tools = [{
  functionDeclarations: [{
    name: "delegate_to_openclaw",
    description: "Hand a task to OpenClaw, the agent running on Zech's computer with access to his email, Discord, cron jobs, files, and shell.",
    behavior: Behavior.NON_BLOCKING,
    parameters: {
      type: Type.OBJECT,
      properties: {
        task: { type: Type.STRING, description: "The task, phrased as a clear instruction." },
      },
      required: ["task"],
    },
  }],
}];

const IN_RATE = 16000;
const OUT_RATE = 24000;
const MIC_TAIL_S = 0.4; // keep mic muted briefly after speech ends
const FFT_SIZE = 512;
const LEVEL_GAIN = 4;

interface TokenResponse {
  token: string;
  model: string;
  voice: string;
  error?: string;
}

interface ChatResponse {
  reply: string;
  error?: string;
}

interface DelegateArgs {
  task: string;
}

function floatToPcm16Base64(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s * 32767;
  }
  const bytes = new Uint8Array(i16.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function pcm16Base64ToFloat(b64: string): Float32Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  const i16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) {
    f32[i] = i16[i] / 32768;
  }
  return f32;
}

function readRms(analyser: AnalyserNode, data: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  const level = Math.sqrt(sum / data.length) * LEVEL_GAIN;
  return Math.min(1, level);
}

export async function startVoice(handlers: VoiceHandlers): Promise<VoiceEngine> {
  handlers.onState?.("connecting");

  const res = await fetch("/api/voice-token", { method: "POST" });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok) {
    throw new Error(data.error || "could not get voice token");
  }

  const ai = new GoogleGenAI({
    apiKey: data.token,
    httpOptions: { apiVersion: "v1alpha" },
  });

  // Speaker: schedule PCM chunks back to back on one playhead
  const outCtx = new AudioContext({ sampleRate: OUT_RATE });
  const master = outCtx.createGain();
  const outAnalyser = outCtx.createAnalyser();
  outAnalyser.fftSize = FFT_SIZE;
  master.connect(outAnalyser);
  outAnalyser.connect(outCtx.destination);
  let playhead = 0;
  let liveSources: AudioBufferSourceNode[] = [];

  function play(b64: string) {
    const f32 = pcm16Base64ToFloat(b64);
    const buf = outCtx.createBuffer(1, f32.length, OUT_RATE);
    buf.copyToChannel(f32, 0);
    const src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    const startAt = Math.max(outCtx.currentTime, playhead);
    src.start(startAt);
    playhead = startAt + buf.duration;
    liveSources.push(src);
    src.onended = () => {
      liveSources = liveSources.filter((s) => s !== src);
    };
  }

  function flush() {
    for (const src of liveSources) {
      try { src.stop(); } catch { /* already ended */ }
    }
    liveSources = [];
    playhead = 0;
  }

  function isPlaying(): boolean {
    return outCtx.currentTime < playhead + MIC_TAIL_S;
  }

  let session: Session | null = null;

  async function runDelegation(call: FunctionCall) {
    const args = call.args as unknown as DelegateArgs;
    const task = args.task;
    handlers.onStatus?.(`Delegating: ${task}`);
    handlers.onState?.("thinking");
    handlers.onDelegation?.(task);
    let response: Record<string, unknown>;
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: task }] }),
      });
      const d = (await r.json()) as ChatResponse;
      if (r.ok) {
        response = { status: "done", result: d.reply.slice(-3000) || "(no output)" };
        handlers.onExchange?.(task, d.reply);
      } else {
        response = { status: "error", note: d.error };
      }
    } catch (e) {
      response = { status: "error", note: (e as Error).message };
    }
    handlers.onStatus?.("Listening");
    handlers.onState?.("listening");
    try {
      session!.sendToolResponse({
        functionResponses: [{
          id: call.id,
          name: call.name,
          response: response,
          scheduling: FunctionResponseScheduling.INTERRUPT,
        }],
      });
    } catch { /* session closed while task ran */ }
  }

  session = await ai.live.connect({
    model: data.model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: SYSTEM_PROMPT,
      tools,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: data.voice } },
      },
    },
    callbacks: {
      onmessage: (msg) => {
        if (msg.serverContent?.interrupted) flush();
        for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) play(part.inlineData.data);
        }
        for (const call of msg.toolCall?.functionCalls ?? []) {
          if (call.name === "delegate_to_openclaw") runDelegation(call); // not awaited: keep audio flowing
        }
      },
      onerror: (e) => {
        handlers.onError?.(e.message || String(e));
        handlers.onState?.("error");
      },
      onclose: () => {
        handlers.onStatus?.("Voice disconnected");
        handlers.onState?.("disconnected");
      },
    },
  });

  // Mic: half duplex like the bridge - drop chunks while Iris is talking
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const inCtx = new AudioContext({ sampleRate: IN_RATE });
  const micSource = inCtx.createMediaStreamSource(stream);
  const inAnalyser = inCtx.createAnalyser();
  inAnalyser.fftSize = FFT_SIZE;
  micSource.connect(inAnalyser);
  // ponytail: ScriptProcessor is deprecated but universal; move to AudioWorklet if it disappears
  const proc = inCtx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => {
    if (isPlaying()) return;
    const b64 = floatToPcm16Base64(e.inputBuffer.getChannelData(0));
    try {
      session!.sendRealtimeInput({ audio: { data: b64, mimeType: "audio/pcm;rate=16000" } });
    } catch { /* connection mid-teardown */ }
  };
  micSource.connect(proc);
  const mute = inCtx.createGain(); // ScriptProcessor only fires when routed to destination; keep it silent
  mute.gain.value = 0;
  proc.connect(mute);
  mute.connect(inCtx.destination);

  handlers.onStatus?.("Listening");
  handlers.onState?.("listening");

  const inData = new Float32Array(FFT_SIZE);
  const outData = new Float32Array(FFT_SIZE);
  const levels: VoiceLevels = { input: 0, output: 0 };

  function getLevels(): VoiceLevels {
    levels.input = readRms(inAnalyser, inData);
    levels.output = readRms(outAnalyser, outData);
    return levels;
  }

  function stop() {
    try { session!.close(); } catch { /* already closed */ }
    proc.disconnect();
    micSource.disconnect();
    for (const track of stream.getTracks()) track.stop();
    inCtx.close();
    flush();
    outCtx.close();
  }

  return { getLevels, isSpeaking: isPlaying, stop };
}
