import { PorcupineWorker } from "@picovoice/porcupine-web";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";

// ponytail: worker is never terminate()d - it idles unsubscribed between
// cycles to avoid re-loading the WASM; tab close reclaims it.
let worker: PorcupineWorker | null = null;
let onWake: (() => void) | null = null;

export async function startWake(cb: () => void): Promise<void> {
  onWake = cb;
  if (!worker) {
    worker = await PorcupineWorker.create(
      process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY!,
      { publicPath: "/hey-iris.ppn", label: "hey iris" },
      () => onWake?.(),
      { publicPath: "/porcupine_params.pv" },
    );
  }
  await WebVoiceProcessor.subscribe(worker);
}

export async function stopWake(): Promise<void> {
  // Nulled first so a detection already in flight is ignored
  onWake = null;
  if (worker) {
    await WebVoiceProcessor.unsubscribe(worker);
  }
}
