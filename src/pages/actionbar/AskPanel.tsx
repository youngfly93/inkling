import type { RefObject } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { AskIcon } from "./icons";
import {
  panelGhostButtonStyle,
  panelIconButtonStyle,
  panelKickerStyle,
  panelPrimaryButtonStyle,
  preventButtonFocus,
} from "./styles";

interface AskPanelProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  question: string;
  loading: string | null;
  sourceName: string;
  selectedText: string;
  onQuestionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function AskPanel({
  inputRef,
  question,
  loading,
  sourceName,
  selectedText,
  onQuestionChange,
  onClose,
  onSubmit,
}: AskPanelProps) {
  const isAsking = loading === "ask";
  const canSubmit = !!question.trim() && !isAsking;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{
        width: 360,
        maxWidth: "96vw",
        borderRadius: 12,
        overflow: "hidden",
        background: "#ffffff",
        border: "1px solid rgba(10,10,10,0.1)",
        boxShadow: "0 14px 32px rgba(0,0,0,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            borderRadius: 6,
            background: "#0a0a0a",
            color: "#ffffff",
          }}
        >
          <AskIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: "#0a0a0a",
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            Ask AI
          </div>
          <div
            style={{
              marginTop: 1,
              color: "rgba(10,10,10,0.45)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            selected text
          </div>
        </div>
        <button
          type="button"
          onMouseDown={preventButtonFocus}
          onClick={onClose}
          style={panelIconButtonStyle()}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div
        style={{
          padding: "10px 12px 6px",
          borderBottom: "1px dashed rgba(10,10,10,0.08)",
        }}
      >
        <div style={panelKickerStyle()}>Source · {sourceName}</div>
        <div
          style={{
            marginTop: 4,
            color: "rgba(10,10,10,0.55)",
            fontSize: 12,
            lineHeight: 1.5,
            maxHeight: 36,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            whiteSpace: "pre-wrap",
          }}
        >
          {selectedText}
        </div>
      </div>

      <div style={{ padding: "10px 12px 12px", background: "#fafafa" }}>
        <div style={panelKickerStyle()}>Question</div>
        <textarea
          ref={inputRef}
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ask about the selected text..."
          style={{
            width: "100%",
            minHeight: 76,
            marginTop: 6,
            resize: "vertical",
            border: "1px solid rgba(10,10,10,0.1)",
            borderRadius: 8,
            outline: "none",
            padding: "9px 10px",
            boxSizing: "border-box",
            color: "#0a0a0a",
            background: "#ffffff",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 8,
          }}
        >
          <button type="button" onMouseDown={preventButtonFocus} onClick={onClose} style={panelGhostButtonStyle()}>
            Cancel
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onMouseDown={preventButtonFocus}
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              ...panelPrimaryButtonStyle(),
              opacity: canSubmit ? 1 : 0.45,
              cursor: canSubmit ? "pointer" : "default",
            }}
          >
            {isAsking ? <Loader2 size={12} className="spin" /> : <SendHorizontal size={12} />}
            {isAsking ? "Asking..." : "Ask"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
