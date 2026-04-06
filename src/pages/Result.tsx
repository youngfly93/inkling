import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Check } from "lucide-react";

const RESULT_STORAGE_KEY = "__seleany_result";

export default function ResultPage() {
  const [output, setOutput] = useState("");
  const [original, setOriginal] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(RESULT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { text?: string; original?: string };
        setOutput(parsed.text ?? "");
        setOriginal(parsed.original ?? "");
      } catch (_) {
        // Ignore malformed cached payloads.
      }
    }

    const unlisten = listen<{ text: string; original: string }>("show-result", (e) => {
      setOutput(e.payload.text);
      setOriginal(e.payload.original);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", height: "100vh" }}>
      {original && (
        <div style={{
          fontSize: 12,
          color: "var(--muted)",
          marginBottom: 12,
          padding: "8px 10px",
          background: "var(--border)",
          borderRadius: 6,
          lineHeight: 1.5,
          maxHeight: 80,
          overflowY: "auto",
        }}>
          {original}
        </div>
      )}

      <div style={{
        flex: 1,
        fontSize: 14,
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
        overflowY: "auto",
        userSelect: "text",
        WebkitUserSelect: "text",
      }}>
        {output || "Loading..."}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button
          onClick={handleCopy}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 14px", borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)", color: "var(--fg)",
            fontSize: 13, cursor: "pointer",
          }}
        >
          {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={() => getCurrentWindow().close()}
          style={{
            padding: "6px 14px", borderRadius: 6,
            border: "none",
            background: "var(--accent)", color: "white",
            fontSize: 13, cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
