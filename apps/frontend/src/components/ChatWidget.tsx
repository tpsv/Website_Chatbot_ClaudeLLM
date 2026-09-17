import { useState, useRef, useEffect } from "react";
import { BACKEND_URL } from "../lib/config";

type Message = { role: "user" | "assistant"; content: string };

export function ChatWidget() {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm the Fade & Co. assistant — ask me about services, pricing, or hours." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const openWidget = () => setOpen(true);
    window.addEventListener("open-chat-widget", openWidget);
    return () => window.removeEventListener("open-chat-widget", openWidget);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    // Module 3: we now send the WHOLE conversation so far, not just the
    // latest message — the model has no memory of its own between requests,
    // so the client is what carries the conversation forward each turn.
    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? data.error ?? "(no reply)" }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Couldn't reach the backend — is it running?" }]);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button className="widget-launcher" onClick={() => setOpen(true)}>
        Chat with us
      </button>
    );
  }

  return (
    <div className="widget-panel">
      <header className="widget-header">
        <span>Fade &amp; Co. Assistant</span>
        <button aria-label="Close chat" onClick={() => setOpen(false)}>
          &times;
        </button>
      </header>
      <div className="widget-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === "assistant" ? "bot" : "user"}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="bubble bot typing">...</div>}
      </div>
      <form
        className="widget-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about hours, services, or book..."
          disabled={sending}
        />
        <button type="submit" disabled={sending}>
          Send
        </button>
      </form>
    </div>
  );
}
