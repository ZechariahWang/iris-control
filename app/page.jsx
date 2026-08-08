"use client";

import { useRef, useState } from "react";
import { startVoice } from "./voice";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const stopVoiceRef = useRef(null);

  async function toggleVoice() {
    if (stopVoiceRef.current) {
      stopVoiceRef.current();
      stopVoiceRef.current = null;
      setVoiceActive(false);
      setVoiceStatus("");
      return;
    }
    setVoiceStatus("Connecting...");
    try {
      stopVoiceRef.current = await startVoice({
        onStatus: setVoiceStatus,
        onExchange: (task, reply) =>
          setMessages((prev) => [
            ...prev,
            { role: "user", content: `[voice] ${task}` },
            { role: "assistant", content: reply },
          ]),
        onError: (text) => setVoiceStatus(`Voice error: ${text}`),
      });
      setVoiceActive(true);
    } catch (err) {
      setVoiceStatus(`Voice error: ${err.message}`);
    }
  }

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      const reply = res.ok ? data.reply : `Error: ${data.error}`;
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages([...next, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Iris Control</h1>
        <button
          type="button"
          onClick={toggleVoice}
          className={
            voiceActive
              ? "rounded-lg bg-red-600 px-3 py-1 text-sm text-white"
              : "rounded-lg bg-gray-200 px-3 py-1 text-sm text-black"
          }
        >
          {voiceActive ? "Stop voice" : "🎙 Voice"}
        </button>
        {voiceStatus && <span className="text-sm text-gray-500">{voiceStatus}</span>}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto w-fit max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-white"
                : "w-fit max-w-[80%] whitespace-pre-wrap rounded-lg bg-gray-200 px-3 py-2 text-black"
            }
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="text-sm text-gray-500">Thinking...</div>}
      </div>
      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the agent..."
          className="flex-1 rounded-lg border px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
