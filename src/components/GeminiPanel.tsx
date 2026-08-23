import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "model";
  text: string;
}

const MODELS = [
  { id: "gemini-3.6-flash",  label: "Gemini 3.6 Flash", note: "fast"  },
  { id: "gemini-3.6-pro",    label: "Gemini 3.6 Pro",   note: "smart" },
  { id: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",   note: "deep"  },
  { id: "gemini-2.5-flash",  label: "Gemini 2.5 Flash", note: "lite"  },
];

const KEY_STORAGE   = "gemini-api-key";
const MODEL_STORAGE = "gemini-model";

function renderText(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3).replace(/^\w+\n/, "");
      return <pre key={i} className="gemini-code">{inner}</pre>;
    }
    return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part}</span>;
  });
}

export default function GeminiPanel() {
  const [apiKey,  setApiKey]  = useState(() => localStorage.getItem(KEY_STORAGE)   ?? "");
  const [model,   setModel]   = useState(() => localStorage.getItem(MODEL_STORAGE)  ?? MODELS[0].id);
  const [keyDraft, setKeyDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!showModelMenu) return;
    const close = () => setShowModelMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showModelMenu]);

  function saveKey() {
    const k = keyDraft.trim();
    if (!k) return;
    localStorage.setItem(KEY_STORAGE, k);
    setApiKey(k);
    setKeyDraft("");
  }

  function clearKey() {
    localStorage.removeItem(KEY_STORAGE);
    setApiKey("");
    setMessages([]);
    setError("");
  }

  function selectModel(id: string) {
    setModel(id);
    localStorage.setItem(MODEL_STORAGE, id);
    setShowModelMenu(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || !apiKey || loading) return;
    setInput("");
    setError("");

    const userMsg: Message = { role: "user", text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "model", text: "" }]);
    setLoading(true);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status}: ${body}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json || json === "[DONE]") continue;
          try {
            const data = JSON.parse(json);
            const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            accumulated += chunk;
            setMessages((prev) =>
              prev.map((m, i) => (i === prev.length - 1 ? { ...m, text: accumulated } : m)),
            );
          } catch {}
        }
      }
    } catch (e) {
      setError(String(e));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

  if (!apiKey) {
    return (
      <div className="gemini-panel gemini-setup">
        <div className="gemini-header">
          <span className="gemini-title">Gemini</span>
        </div>
        <div className="gemini-setup-body">
          <p className="gemini-setup-lead">Enter your Gemini API key to start chatting with AI alongside your code.</p>
          <input
            type="password"
            placeholder="AIza..."
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveKey()}
            className="gemini-key-input"
            autoFocus
          />
          <button className="gemini-connect-btn" onClick={saveKey} disabled={!keyDraft.trim()}>
            Connect
          </button>
          <p className="gemini-note">Get a free key at <span className="gemini-link">aistudio.google.com</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className="gemini-panel">
      <div className="gemini-header">
        <span className="gemini-title">Gemini</span>

        <div
          className="gemini-model-picker"
          onClick={(e) => { e.stopPropagation(); setShowModelMenu((v) => !v); }}
        >
          <span className="gemini-model-name">{currentModel.label}</span>
          <span className="gemini-model-caret">▾</span>

          {showModelMenu && (
            <div className="gemini-model-menu" onClick={(e) => e.stopPropagation()}>
              {MODELS.map((m) => (
                <div
                  key={m.id}
                  className={`gemini-model-option ${m.id === model ? "active" : ""}`}
                  onClick={() => selectModel(m.id)}
                >
                  <div>
                    <div className="gemini-model-opt-label">{m.label}</div>
                    <div className="gemini-model-opt-id">{m.note}</div>
                  </div>
                  {m.id === model && <span className="gemini-model-check">&#10003;</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="gemini-disconnect" onClick={clearKey} title="Disconnect">&times;</button>
      </div>

      <div className="gemini-messages">
        {messages.length === 0 && (
          <div className="gemini-empty">
            Ask anything about your code.
            <br />
            Shift+Enter for a newline.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`gemini-msg gemini-msg-${m.role}`}>
            <div className="gemini-msg-label">
              {m.role === "user" ? "You" : currentModel.label}
            </div>
            <div className="gemini-msg-body">
              {m.text ? renderText(m.text) : <span className="gemini-thinking">|</span>}
            </div>
          </div>
        ))}
        {error && <div className="gemini-error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="gemini-input-row">
        <textarea
          ref={inputRef}
          className="gemini-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Ask Gemini..."
          rows={3}
          disabled={loading}
        />
        <div className="gemini-input-footer">
          <span className="gemini-input-hint">Shift+Enter for newline</span>
          <button className="gemini-send" onClick={send} disabled={loading || !input.trim()}>
            {loading ? "Generating..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
