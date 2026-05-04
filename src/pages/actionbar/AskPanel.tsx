import type { RefObject } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { AskIcon } from "./icons";
import {
  panelBodyStyle,
  panelCaptionStyle,
  panelGhostButtonStyle,
  panelHeaderStyle,
  panelIconBadgeStyle,
  panelIconButtonStyle,
  panelKickerStyle,
  panelPrimaryButtonStyle,
  panelSourceStyle,
  panelSurfaceStyle,
  panelTextareaStyle,
  panelTitleStyle,
  preventButtonFocus,
  sourcePreviewStyle,
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
      style={panelSurfaceStyle()}
    >
      <div style={panelHeaderStyle()}>
        <div style={panelIconBadgeStyle()}>
          <AskIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={panelTitleStyle()}>Ask AI</div>
          <div style={panelCaptionStyle()}>selected text</div>
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

      <div style={panelSourceStyle()}>
        <div style={panelKickerStyle()}>Source · {sourceName}</div>
        <div style={sourcePreviewStyle()}>{selectedText}</div>
      </div>

      <div style={panelBodyStyle()}>
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
          style={panelTextareaStyle()}
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
