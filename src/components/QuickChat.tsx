"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { ChatIcon, SendIcon, SparklesIcon } from "./ui/Icons";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatEvent =
  | { kind: "delta"; delta: string }
  | { kind: "done"; tokensIn: number; tokensOut: number; ms: number }
  | { kind: "error"; message: string };

const CHAT_EXAMPLES = [
  "Explain how this architecture should handle retries",
  "Compare Kafka and Redis Streams for this workload",
  "Review a technical decision and surface the tradeoffs",
];

export function QuickChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ tokens: number; ms: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(value: string) {
    const content = value.trim();
    if (!content || busy) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "" };
    const history = [...messages.filter((message) => message.content).slice(-10), userMessage];
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setBusy(true);
    setError(null);
    setStats(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content: message }) => ({ role, content: message.slice(0, 4_000) })),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ error: "Chat request failed." }));
        throw new Error(payload.error ?? `Chat request failed (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const event = JSON.parse(line.slice(5).trim()) as ChatEvent;
          if (event.kind === "delta") {
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + event.delta } : message,
            ));
          } else if (event.kind === "done") {
            setStats({ tokens: event.tokensIn + event.tokensOut, ms: event.ms });
          } else {
            throw new Error(event.message);
          }
        }
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Chat could not complete this response.");
        setMessages((current) => current.map((message) =>
          message.id === assistantId && !message.content
            ? { ...message, content: "_Response unavailable. Try again in a moment._" }
            : message,
        ));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <section className={`loom-quick-chat${messages.length ? " has-messages" : ""}`} aria-label="Quick chat">
      {messages.length ? (
        <div ref={scrollRef} className="loom-chat-thread" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`loom-chat-message is-${message.role}`}>
              <span>{message.role === "user" ? "You" : "Loom"}</span>
              {message.role === "assistant" ? (
                message.content ? <Markdown>{message.content}</Markdown> : (
                  <p className="loom-chat-thinking"><SparklesIcon size={15} /> Thinking…</p>
                )
              ) : <p>{message.content}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className="loom-chat-empty">
          <ChatIcon size={20} />
          <strong>Ask Loom directly</strong>
          <p>Use Chat for one fast answer. Use Agent swarm when the work should split across specialists.</p>
        </div>
      )}

      <form className="loom-chat-form" onSubmit={submit}>
        <textarea
          aria-label="Chat message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          maxLength={4_000}
          rows={messages.length ? 2 : 3}
          disabled={busy}
          placeholder="Ask a technical question, review a decision, or explore an idea…"
        />
        <button type="submit" disabled={busy || !draft.trim()} aria-label="Send chat message">
          <SendIcon size={17} />
          <span>Send</span>
        </button>
      </form>

      {!messages.length ? (
        <div className="loom-chat-examples">
          {CHAT_EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setDraft(example)}>{example}</button>
          ))}
        </div>
      ) : null}

      <div className="loom-chat-meta">
        <span>Each message uses 1 hourly run</span>
        {stats ? <span>{stats.tokens.toLocaleString()} tokens≈ · {(stats.ms / 1000).toFixed(1)}s</span> : null}
      </div>
      {error ? <p className="loom-chat-error" role="alert">{error}</p> : null}
    </section>
  );
}
