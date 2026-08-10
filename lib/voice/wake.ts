import * as ort from "onnxruntime-web";

// openWakeWord pipeline: 80ms audio chunks -> melspectrogram model ->
// embedding model (76 mel frames, stride 8) -> classifier (16 embeddings) -> score.
// Runs fully locally via WASM; nothing leaves the device while armed.
const WAKE_MODEL_PATH = "/iris.onnx";
const CHUNK_SAMPLES = 1280; // 80ms at 16kHz
const MEL_BINS = 32;
const MEL_WINDOW = 76; // mel frames per embedding
const MEL_STRIDE = 8;
const EMB_WINDOW = 16; // embeddings per classifier run
const THRESHOLD = 0.5;

interface Sessions {
  mel: ort.InferenceSession;
  emb: ort.InferenceSession;
  wake: ort.InferenceSession;
}

let sessions: Sessions | null = null;
let onWake: (() => void) | null = null;

let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;

// Streaming buffers, reset on each startWake
let pending = new Float32Array(0);
let melFrames: Float32Array[] = [];
let embPos = MEL_WINDOW; // exclusive end index of the next embedding window
let embeddings: Float32Array[] = [];
let queue: Float32Array[] = [];
let busy = false;

async function loadSessions(): Promise<Sessions> {
  if (sessions) return sessions;
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = 1;
  const [mel, emb, wake] = await Promise.all([
    ort.InferenceSession.create("/melspectrogram.onnx"),
    ort.InferenceSession.create("/embedding_model.onnx"),
    ort.InferenceSession.create(WAKE_MODEL_PATH),
  ]);
  sessions = { mel, emb, wake };
  return sessions;
}

async function runModel(session: ort.InferenceSession, tensor: ort.Tensor): Promise<Float32Array> {
  const feeds: Record<string, ort.Tensor> = {};
  feeds[session.inputNames[0]] = tensor;
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  return output.data as Float32Array;
}

async function processChunk(s: Sessions, chunk: Float32Array): Promise<void> {
  const melInput = new ort.Tensor("float32", chunk, [1, CHUNK_SAMPLES]);
  const melOut = await runModel(s.mel, melInput);
  const frameCount = melOut.length / MEL_BINS;
  for (let f = 0; f < frameCount; f++) {
    const frame = new Float32Array(MEL_BINS);
    for (let i = 0; i < MEL_BINS; i++) {
      // openWakeWord's mandatory melspec transform
      frame[i] = melOut[f * MEL_BINS + i] / 10 + 2;
    }
    melFrames.push(frame);
  }

  while (melFrames.length >= embPos) {
    const window = new Float32Array(MEL_WINDOW * MEL_BINS);
    for (let f = 0; f < MEL_WINDOW; f++) {
      window.set(melFrames[embPos - MEL_WINDOW + f], f * MEL_BINS);
    }
    const embInput = new ort.Tensor("float32", window, [1, MEL_WINDOW, MEL_BINS, 1]);
    const embedding = await runModel(s.emb, embInput);
    embeddings.push(embedding);
    if (embeddings.length > EMB_WINDOW) embeddings.shift();
    embPos += MEL_STRIDE;

    if (embeddings.length === EMB_WINDOW) {
      const flat = new Float32Array(EMB_WINDOW * embeddings[0].length);
      for (let e = 0; e < EMB_WINDOW; e++) {
        flat.set(embeddings[e], e * embeddings[0].length);
      }
      const wakeInput = new ort.Tensor("float32", flat, [1, EMB_WINDOW, embeddings[0].length]);
      const score = await runModel(s.wake, wakeInput);
      // Near-misses surface here so THRESHOLD can be tuned
      if (score[0] > 0.1) console.debug("wake score", score[0]);
      if (score[0] > THRESHOLD) onWake?.();
    }
  }

  // Trim consumed mel frames so the buffer stays bounded
  if (melFrames.length > MEL_WINDOW * 4) {
    const drop = embPos - MEL_WINDOW;
    melFrames.splice(0, drop);
    embPos -= drop;
  }
}

function pump(): void {
  if (busy) return;
  busy = true;
  void (async () => {
    while (queue.length > 0 && sessions) {
      const chunk = queue.shift()!;
      try {
        await processChunk(sessions, chunk);
      } catch {
        // drop the chunk; next one re-enters the pipeline
      }
    }
    busy = false;
  })();
}

export async function startWake(cb: () => void): Promise<void> {
  onWake = cb;
  pending = new Float32Array(0);
  melFrames = [];
  embPos = MEL_WINDOW;
  embeddings = [];
  queue = [];

  await loadSessions();
  if (!onWake) return; // stopped while models were loading

  stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  if (!onWake) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    return;
  }
  ctx = new AudioContext({ sampleRate: 16000 });
  const source = ctx.createMediaStreamSource(stream);
  // ponytail: ScriptProcessor is deprecated but universal, same as engine.ts
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  proc.onaudioprocess = (e) => {
    if (!onWake) return;
    const input = e.inputBuffer.getChannelData(0);
    const merged = new Float32Array(pending.length + input.length);
    merged.set(pending, 0);
    for (let i = 0; i < input.length; i++) {
      // openWakeWord expects raw int16-range values, not -1..1 floats
      merged[pending.length + i] = input[i] * 32768;
    }
    let offset = 0;
    while (merged.length - offset >= CHUNK_SAMPLES) {
      queue.push(merged.slice(offset, offset + CHUNK_SAMPLES));
      offset += CHUNK_SAMPLES;
    }
    pending = merged.slice(offset);
    pump();
  };
  source.connect(proc);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  proc.connect(mute);
  mute.connect(ctx.destination);
}

export async function stopWake(): Promise<void> {
  // Nulled first so in-flight audio callbacks and detections are ignored
  onWake = null;
  queue = [];
  if (ctx) {
    await ctx.close();
    ctx = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}
