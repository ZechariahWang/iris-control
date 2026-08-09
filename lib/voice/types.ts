export type VoiceUiState = "idle" | "armed" | "connecting" | "listening" | "speaking" | "thinking" | "error";

export interface ChatMessage { role: "user" | "assistant"; content: string; }

export interface VoiceLevels { input: number; output: number; } // 0..1 smoothed RMS

export interface VoiceHandlers {
  onStatus?: (text: string) => void;
  onState?: (state: "connecting" | "listening" | "thinking" | "error" | "disconnected") => void;
  onDelegation?: (task: string) => void;
  onExchange?: (task: string, reply: string) => void;
  onError?: (text: string) => void;
}

export interface VoiceEngine {
  getLevels: () => VoiceLevels;
  isSpeaking: () => boolean;
  stop: () => void;
}

export interface UseVoiceResult {
  state: VoiceUiState;
  statusText: string;
  toggle: () => void;
  getLevels: () => VoiceLevels;
}
