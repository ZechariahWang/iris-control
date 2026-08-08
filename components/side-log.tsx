"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Mic, Terminal } from "lucide-react";
import type { VoiceUiState } from "@/lib/voice/types";

export interface LogEntry {
  id: number;
  kind: "command" | "delegation";
  text: string;
  time: string;
  status: "running" | "done";
  result?: string;
}

const DOT_CLASS: Record<VoiceUiState, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-blue",
  listening: "bg-primary",
  speaking: "bg-accent",
  thinking: "bg-blue",
  error: "bg-destructive",
};

interface SideLogProps {
  entries: LogEntry[];
  voiceState: VoiceUiState;
}

export function SideLog({ entries, voiceState }: SideLogProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());

  function toggleOpen(id: number) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card/70 backdrop-blur md:w-72">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${DOT_CLASS[voiceState]}`}
          />
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Iris</h1>
        </div>
        <p className="text-sm text-muted-foreground">Voice assistant</p>
      </div>

      <div className="px-5 pb-1 pt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Activity
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 pb-4 pt-1">
        {entries.length === 0 && (
          <p className="px-2 pt-2 text-sm text-muted-foreground">
            Commands and delegated tasks appear here.
          </p>
        )}
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              layout
              initial={{ opacity: 0, x: -28, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
            >
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {entry.kind === "delegation" ? (
                  <Mic className="h-3 w-3" />
                ) : (
                  <Terminal className="h-3 w-3" />
                )}
                {entry.kind}
                <span className="ml-auto normal-case tracking-normal">{entry.time}</span>
              </div>
              <p className="mt-1 text-sm leading-snug text-foreground">{entry.text}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {entry.status === "running" ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue" />
                    Running
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3 text-success" />
                    Done
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </aside>
  );
}
