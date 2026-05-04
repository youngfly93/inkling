import type { ReactNode } from "react";
import { AlertCircle, ArrowUpRight, Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import { AskIcon } from "./icons";
import {
  panelBodyStyle,
  panelCaptionStyle,
  panelFooterStyle,
  panelGhostButtonStyle,
  panelHeaderStyle,
  panelIconBadgeStyle,
  panelIconButtonStyle,
  panelKickerStyle,
  panelPrimaryButtonStyle,
  panelSourceStyle,
  panelStatusStyle,
  panelSurfaceStyle,
  panelTitleStyle,
  preventButtonFocus,
  sourcePreviewStyle,
  ui,
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
  onAsk: () => void;
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
  onAsk,
  onCopy,
  onUndo,
  onReplace,
}: ResultPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={panelSurfaceStyle()}
    >
      <div style={panelHeaderStyle()}>
        <div style={panelIconBadgeStyle(resultTone === "error" ? ui.color.error : ui.color.ink)}>
          {resultTone === "error" ? <AlertCircle size={13} /> : activeAction?.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={panelTitleStyle()}>
            {resultTitle || activeAction?.label || "Result"}
          </div>
          <div style={panelCaptionStyle()}>{isErrorResult ? "issue" : resultStats}</div>
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

      <div style={panelBodyStyle(resultTone === "error" ? "error" : "default")}>
        <div style={panelKickerStyle()}>{isErrorResult ? "Details" : "Result"}</div>
        <div
          style={{
            marginTop: 6,
            color: resultTone === "error" ? ui.color.errorText : ui.color.ink,
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
        {statusMessage && <div style={panelStatusStyle()}>{statusMessage}</div>}
      </div>

      <div style={panelFooterStyle()}>
        {resultActionId && (
          <button type="button" onMouseDown={preventButtonFocus} onClick={onRetry} style={panelGhostButtonStyle()}>
            Retry
          </button>
        )}
        {showSettingsCta && (
          <button type="button" onMouseDown={preventButtonFocus} onClick={onOpenSettings} style={panelGhostButtonStyle()}>
            <ArrowUpRight size={11} />
            Settings
          </button>
        )}
        {!isErrorResult && (
          <button type="button" onMouseDown={preventButtonFocus} onClick={onAsk} style={panelGhostButtonStyle()}>
            <AskIcon size={11} />
            Ask
          </button>
        )}
        {!isErrorResult && (
          <button type="button" onMouseDown={preventButtonFocus} onClick={onCopy} style={panelGhostButtonStyle()}>
            {copied ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {replaceApplied && (
          <button type="button" onMouseDown={preventButtonFocus} onClick={onUndo} style={panelPrimaryButtonStyle(ui.color.inkStrong)}>
            {loading === "undo" ? "Undoing..." : "Undo"}
          </button>
        )}
        {!replaceApplied && resultCanReplace && !isErrorResult && (
          <button type="button" onMouseDown={preventButtonFocus} onClick={onReplace} style={panelPrimaryButtonStyle()}>
            {loading === "replace" ? "Replacing..." : "Replace"}
          </button>
        )}
        {!resultCanReplace && (
          <button type="button" onMouseDown={preventButtonFocus} onClick={onClose} style={panelPrimaryButtonStyle()}>
            Done
          </button>
        )}
      </div>
    </motion.div>
  );
}
