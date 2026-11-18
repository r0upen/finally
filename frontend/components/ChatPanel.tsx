"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import ChatActions from "./ChatActions";
import type { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  onSend: (text: string) => void;
}

export default function ChatPanel({ messages, loading, error, onSend }: Props) {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, loading, open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    onSend(text);
    setInput("");
  }

  if (!open) {
    return (
      <button
        data-testid="chat-toggle"
        onClick={() => setOpen(true)}
        className="w-9 shrink-0 border-l border-line bg-panel text-muted hover:text-bright [writing-mode:vertical-rl]"
      >
        Open assistant
      </button>
    );
  }

  return (
    <aside data-testid="chat-panel" className="flex w-[360px] shrink-0 flex-col border-l border-line bg-panel">
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-[12px] font-medium text-muted">Assistant</h2>
        <button
          data-testid="chat-toggle"
          onClick={() => setOpen(false)}
          aria-label="Collapse assistant"
          className="px-1 text-muted hover:text-bright"
        >
          Hide
        </button>
      </header>

      <div data-testid="chat-messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !loading && (
          <p className="text-muted">
            Ask about your portfolio, or tell me to trade. Try &quot;buy 5 AAPL&quot; or &quot;what is my
            biggest risk?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            data-testid={`chat-message-${m.role}`}
            className={m.role === "user" ? "ml-8 bg-raised px-3 py-2 text-bright" : "mr-4 border-l-2 border-primary pl-3"}
          >
            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            {m.actions && m.actions.length > 0 && <ChatActions actions={m.actions} />}
          </div>
        ))}
        {loading && (
          <div data-testid="chat-loading" className="flex items-center gap-2 border-l-2 border-primary pl-3 text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Thinking
          </div>
        )}
        {error && (
          <p data-testid="chat-error" role="alert" className="text-down">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-line p-2">
        <input
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message FinAlly"
          className="min-w-0 flex-1 border border-line bg-ink px-2 py-1.5 text-bright placeholder:text-muted"
        />
        <button
          data-testid="chat-send"
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-secondary px-4 font-medium text-bright hover:brightness-125 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
