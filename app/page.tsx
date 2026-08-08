"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, MessageSquare } from "lucide-react";

import { ChatPanel } from "@/components/chat-panel";
import { Button } from "@/components/ui/button";
import { useVoice } from "@/hooks/use-voice";
import type { ChatMessage } from "@/lib/voice/types";

const Orb = dynamic(() => import("@/components/orb/orb"), { ssr: false });

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [flash, setFlash] = useState("");
  const flashTimerRef = useRef<number | null>(null);

  const voice = useVoice({
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
    }
  }

  const statusLine =
    flash || voice.statusText || (voice.state === "idle" ? "Click the orb to talk" : "");

  const dotClass: Record<string, string> = {
    idle: "bg-muted-foreground",
    connecting: "bg-blue",
    listening: "bg-primary",
    speaking: "bg-accent",
    thinking: "bg-blue",
    error: "bg-destructive",
  };

  return (
    <main className="relative h-dvh overflow-hidden bg-background">
      <Orb state={voice.state} getLevels={voice.getLevels} onClick={voice.toggle} />

      <div className="pointer-events-none fixed left-5 top-5 flex items-center gap-2.5 font-mono text-xs tracking-[0.35em] text-muted-foreground">
        <span
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${dotClass[voice.state]}`}
        />
        IRIS
      </div>

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
    </main>
  );
}
