"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, MessageSquare } from "lucide-react";

import { ChatPanel } from "@/components/chat-panel";
import { SideLog, type LogEntry } from "@/components/side-log";
import { Button } from "@/components/ui/button";
import { useVoice } from "@/hooks/use-voice";
import type { ChatMessage } from "@/lib/voice/types";

import Orb from "@/components/orb/orb";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [flash, setFlash] = useState("");
  const flashTimerRef = useRef<number | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  function addLog(kind: LogEntry["kind"], text: string): number {
    logIdRef.current += 1;
    const id = logIdRef.current;
    const entry: LogEntry = {
      id,
      kind,
      text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "running",
    };
    setLogEntries((prev) => [...prev.slice(-39), entry]);
    return id;
  }

  function finishLog(id: number) {
    setLogEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "done" as const } : e))
    );
  }

  const voice = useVoice({
    onDelegation: (task) => {
      addLog("delegation", task);
    },
    onExchange: (task, reply) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: `[voice] ${task}` },
        { role: "assistant", content: reply },
      ]);
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      setFlash("Task complete");
      flashTimerRef.current = window.setTimeout(() => setFlash(""), 2500);
    },
  });

  async function send(text: string) {
    if (busy) return;
    const logId = addLog("command", text);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
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
      setMessages([...next, { role: "assistant", content: `Error: ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
      finishLog(logId);
    }
  }

  const statusLine =
    flash || voice.statusText || (voice.state === "idle" ? "Click the orb to talk" : "");

  // A delegation runs while the orb is thinking; derived here so success and
  // error both settle to done without syncing state
  const lastDelegationId = logEntries.findLast((e) => e.kind === "delegation")?.id;
  const displayEntries = logEntries.map((e) =>
    e.kind === "delegation"
      ? {
          ...e,
          status: (e.id === lastDelegationId && voice.state === "thinking"
            ? "running"
            : "done") as LogEntry["status"],
        }
      : e
  );

  return (
    <main className="flex h-dvh overflow-hidden bg-background">
      <SideLog entries={displayEntries} voiceState={voice.state} />

      <div className="relative flex-1">
        <Orb state={voice.state} getLevels={voice.getLevels} onClick={voice.toggle} />

        <div className="pointer-events-none absolute left-1/2 top-[calc(50%+min(24vmin,240px))] -translate-x-1/2">
          <AnimatePresence mode="wait">
            <motion.p
              key={statusLine}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground"
            >
              {statusLine}
            </motion.p>
          </AnimatePresence>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label={panelOpen ? "Close chat" : "Open chat"}
          onClick={() => setPanelOpen((open) => !open)}
          className="fixed right-3 top-1/2 z-50 -translate-y-1/2"
        >
          {panelOpen ? <ChevronRight /> : <MessageSquare />}
        </Button>

        <ChatPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          messages={messages}
          busy={busy}
          onSend={send}
        />
      </div>
    </main>
  );
}
