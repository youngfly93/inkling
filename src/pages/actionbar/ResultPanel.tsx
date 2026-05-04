import type { ReactNode } from "react";
import { AlertCircle, ArrowUpRight, Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import {
  panelGhostButtonStyle,
  panelIconButtonStyle,
  panelKickerStyle,
  panelPrimaryButtonStyle,
  preventButtonFocus,
} from "./styles";
import type { ActionId, ResultTone } from "./types";

interface ResultPanelProps {
  result: string;
  resultTone: ResultTone;
  isErrorResult: boolean;
  activeAction: { label: string; icon: ReactNode } | null;
  resultTitle: string | null;
  resultStats: string | null;
  sourceName: string;
  selectedText: string;
  statusMessage: string | null;
  resultActionId: ActionId | null;
  showSettingsCta: boolean;
  copied: boolean;
  replaceApplied: boolean;
  resultCanReplace: boolean;
  loading: string | null;
  onClose: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onCopy: () => void;
  onUndo: () => void;
  onReplace: () => void;
}

export function ResultPanel({
  result,
  resultTone,
  isErrorResult,
  activeAction,
  resultTitle,
  resultStats,
  sourceName,
  selectedText,
  statusMessage,
  resultActionId,
  showSettingsCta,
  copied,
  replaceApplied,
  resultCanReplace,
  loading,
  onClose,
  onRetry,
  onOpenSettings,
  onCopy,
  onUndo,
  onReplace,
}: ResultPanelProps) {
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
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
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
            background: resultTone === "error" ? "#b91c1c" : "#0a0a0a",
            color: "#ffffff",
          }}
        >
          {resultTone === "error" ? <AlertCircle size={13} /> : activeAction?.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: "#0a0a0a",
              fontSize: 12,
              fontWeight: 650,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {resultTitle || activeAction?.label || "Result"}
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
            {isErrorResult ? "issue" : resultStats}
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

      <div
        style={{
          padding: "10px 12px 14px",
          background: resultTone === "error" ? "#fff7f7" : "#fafafa",
        }}
      >
        <div style={panelKickerStyle()}>{isErrorResult ? "Details" : "Result"}</div>
        <div
          style={{
            marginTop: 6,
            color: resultTone === "error" ? "#991b1b" : "#0a0a0a",
            fontSize: isErrorResult ? 13 : 14,
            lineHeight: 1.55,
            maxHeight: 190,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        >
          {result}
        </div>
        {statusMessage && (
          <div
            style={{
              marginTop: 10,
              color: "rgba(10,10,10,0.48)",
              fontSize: 11,
              lineHeight: 1.45,
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 10px",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          background: "#ffffff",
        }}
      >
        {resultActionId && (
          <button onMouseDown={preventButtonFocus} onClick={onRetry} style={panelGhostButtonStyle()}>
            Retry
          </button>
        )}
        {showSettingsCta && (
          <button onMouseDown={preventButtonFocus} onClick={onOpenSettings} style={panelGhostButtonStyle()}>
            <ArrowUpRight size={11} />
            Settings
          </button>
        )}
        {!isErrorResult && (
          <button onMouseDown={preventButtonFocus} onClick={onCopy} style={panelGhostButtonStyle()}>
            {copied ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {replaceApplied && (
          <button onMouseDown={preventButtonFocus} onClick={onUndo} style={panelPrimaryButtonStyle("#1f1f1f")}>
            {loading === "undo" ? "Undoing..." : "Undo"}
          </button>
        )}
        {!replaceApplied && resultCanReplace && !isErrorResult && (
          <button onMouseDown={preventButtonFocus} onClick={onReplace} style={panelPrimaryButtonStyle()}>
            {loading === "replace" ? "Replacing..." : "Replace"}
          </button>
        )}
        {!resultCanReplace && (
          <button onMouseDown={preventButtonFocus} onClick={onClose} style={panelPrimaryButtonStyle()}>
            Done
          </button>
        )}
      </div>
    </motion.div>
  );
}
