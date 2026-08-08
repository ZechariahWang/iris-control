"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Mic, Send, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/lib/voice/types"

interface ChatPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: ChatMessage[]
  busy: boolean
  onSend: (text: string) => void
}

const VOICE_PREFIX = "[voice]"

export function ChatPanel({ open, onOpenChange, messages, busy, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("")
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTop = viewport.scrollHeight
  }, [messages, busy])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    onSend(text)
    setDraft("")
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="chat-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="fixed right-0 top-0 z-40 flex h-full w-[380px] max-w-[85vw] flex-col border-l border-border bg-card/95 backdrop-blur"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium text-foreground">Chat</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close chat"
              onClick={() => onOpenChange(false)}
            >
              <X />
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div
              ref={viewportRef}
              className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-4"
            >
              <AnimatePresence initial={false}>
                {messages.map((message, index) => (
                  <MessageBubble key={index} message={message} />
                ))}
              </AnimatePresence>

              {busy && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-muted-foreground"
                >
                  Thinking...
                </motion.p>
              )}
            </div>
          </ScrollArea>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type a message..."
              disabled={busy}
              aria-label="Chat message"
            />
            <Button type="submit" size="icon" disabled={busy || draft.trim().length === 0}>
              <Send />
            </Button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const isVoice = message.content.startsWith(VOICE_PREFIX)
  const content = isVoice ? message.content.slice(VOICE_PREFIX.length).trim() : message.content

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        {isVoice && (
          <span className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
            <Mic className="size-3" />
            voice
          </span>
        )}
        {content}
      </div>
    </motion.div>
  )
}
