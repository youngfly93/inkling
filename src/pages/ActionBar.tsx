import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  Languages,
  BookOpen,
  Maximize2,
  Bookmark,
  Copy,
  Loader2,
  Check,
  AlertCircle,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { saveSentence as dbSave, saveTransform } from "../services/db";

const DOCK_SIZE = 38;
const DOCK_MAGNIFICATION = 58;
const DOCK_DISTANCE = 110;

interface Selection {
  text: string;
  app: string;
  appName?: string;
  url: string;
  editable: boolean;
}

interface DockAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
}

type ResultTone = "neutral" | "success" | "warning" | "error";

export default function ActionBar() {
  const [sel, setSel] = useState<Selection>({ text: "", app: "", url: "", editable: false });
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<ResultTone>("neutral");
  const [showSettingsCta, setShowSettingsCta] = useState(false);
  const [copied, setCopied] = useState(false);
  const [replaceApplied, setReplaceApplied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const mouseX = useMotionValue(Infinity);
  const text = sel.text;
  const app = sel.app;
  const url = sel.url;
  const sourceName = getSourceName(sel);
  const isErrorResult = !!result && resultTone === "error";

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    html.classList.add("actionbar-window");
    body.classList.add("actionbar-window");
    root?.classList.add("actionbar-window");

    invoke<Selection>("get_current_selection")
      .then(setSel)
      .catch((e) => console.error("Failed to get selection:", e));

    // Listen for selection updates when window is reused
    const unlisten = listen<Selection>("selection-ready", (event) => {
      setSel(event.payload);
      setLoading(null);
      setResult(null);
      setResultTitle(null);
      setResultTone("neutral");
      setShowSettingsCta(false);
      setCopied(false);
      setReplaceApplied(false);
      setStatusMessage(null);
      setHoveredAction(null);
      mouseX.set(Infinity);
      void resizeActionBarWindow(430, 88);
    });

    return () => {
      html.classList.remove("actionbar-window");
      body.classList.remove("actionbar-window");
      root?.classList.remove("actionbar-window");
      unlisten.then((fn) => fn());
    };
  }, []);

  async function resizeActionBarWindow(width: number, height: number) {
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    await getCurrentWindow().setSize(new LogicalSize(width, height));
  }

  async function revealPanel({
    title,
    body,
    tone = "neutral",
    status = null,
    showSettings = false,
    height = 340,
  }: {
    title: string;
    body: string;
    tone?: ResultTone;
    status?: string | null;
    showSettings?: boolean;
    height?: number;
  }) {
    setResultTitle(title);
    setResult(body);
    setResultTone(tone);
    setStatusMessage(status);
    setShowSettingsCta(showSettings);
    await resizeActionBarWindow(540, height);
    await getCurrentWindow().show();
  }

  useEffect(() => {
    const onBlur = () => {
      setHoveredAction(null);
      mouseX.set(Infinity);
    };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (key === "escape") {
        e.preventDefault();
        void getCurrentWindow().hide();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && key === "z" && replaceApplied && !loading) {
        e.preventDefault();
        void undoLastReplace();
        return;
      }

      if (loading || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      if (result && !replaceApplied && !isErrorResult && sel.editable && e.key === "Enter") {
        e.preventDefault();
        void replaceResult();
        return;
      }

      switch (e.key) {
        case "1":
          e.preventDefault();
          void runAI("to_english");
          break;
        case "2":
          e.preventDefault();
          void runAI("to_chinese");
          break;
        case "3":
          e.preventDefault();
          void runAI("expand");
          break;
        case "4":
          e.preventDefault();
          void handleSave();
          break;
        case "5":
          e.preventDefault();
          copyText();
          break;
      }
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, [isErrorResult, loading, replaceApplied, result, sel.editable]);

  async function runAI(actionId: string) {
    setLoading(actionId);
    setCopied(false);
    setReplaceApplied(false);
    setStatusMessage(null);
    await invoke("set_actionbar_busy", { busy: true });
    try {
      const apiKey = await invoke<string | null>("get_setting", {
        key: "kimi_api_key",
      });
      const apiHost = await invoke<string | null>("get_setting", {
        key: "kimi_api_host",
      });
      const model = await invoke<string | null>("get_setting", {
        key: "kimi_model",
      });
      const normalizedApiKey = (apiKey || "").trim();

      if (!normalizedApiKey) {
        await revealPanel({
          title: "Kimi API key is missing",
          body: "Open Settings from the menu bar and add your Kimi key before running To English, To Chinese, or Expand.",
          tone: "error",
          status: "AI actions stay unavailable until the key is configured.",
          showSettings: true,
          height: 300,
        });
        return;
      }

      const output = await invoke<string>("transform_text", {
        text,
        action: actionId,
        apiKey: normalizedApiKey,
        apiHost: apiHost || "api.moonshot.cn",
        model: model || "moonshot-v1-8k",
      });

      // Save transform to db
      try {
        const sentenceId = await dbSave(text, app || null, url || null);
        await saveTransform(sentenceId, actionId, text, output, model || "moonshot-v1-8k");
      } catch (_) { /* best effort */ }

      await revealPanel({
        title: `${actionLabel(actionId)} ready`,
        body: output,
        tone: "neutral",
        status: sel.editable
          ? `${sourceName} is editable here. Press Enter or click Replace to write back.`
          : `${sourceName} is read-only here. Copy is available, but Replace stays hidden.`,
        height: 360,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("AI error:", e);
      const friendly = describeTransformError(message);
      await revealPanel({
        title: friendly.title,
        body: friendly.detail,
        tone: "error",
        status: friendly.status,
        showSettings: friendly.showSettingsCta,
        height: 320,
      });
      setReplaceApplied(false);
    } finally {
      setLoading(null);
      await invoke("set_actionbar_busy", { busy: false });
    }
  }

  async function handleSave() {
    setLoading("save");
    setCopied(false);
    setStatusMessage(null);
    await invoke("set_actionbar_busy", { busy: true });
    try {
      await dbSave(text, app || null, url || null);
      await getCurrentWindow().hide();
    } catch (e) {
      console.error("Save error:", e);
      const message = e instanceof Error ? e.message : String(e);
      await revealPanel({
        title: "Couldn’t save this sentence",
        body: message,
        tone: "error",
        status: "Try again after the current action finishes.",
        height: 300,
      });
    } finally {
      setLoading(null);
      await invoke("set_actionbar_busy", { busy: false });
    }
  }

  function copyText() {
    void invoke("set_actionbar_busy", { busy: false });
    navigator.clipboard.writeText(result || text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function replaceResult() {
    if (!result) {
      return;
    }

    setLoading("replace");
    await invoke("set_actionbar_busy", { busy: true });
    try {
      await invoke("replace_selection", {
        text: result,
        originalText: text,
        targetApp: app || null,
      });
      setReplaceApplied(true);
      setResultTitle("Replaced in place");
      setResultTone("success");
      setStatusMessage("Cmd/Ctrl+Z or Undo can restore the last replace in supported editors.");
      setShowSettingsCta(false);
      await getCurrentWindow().show();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Replace error:", e);
      const friendly = describeReplaceError(message, sourceName);
      setResultTitle(friendly.title);
      setResult(friendly.detail);
      setResultTone("error");
      setStatusMessage(friendly.status);
      setShowSettingsCta(false);
      setReplaceApplied(false);
      await resizeActionBarWindow(540, 320);
    } finally {
      setLoading(null);
      await invoke("set_actionbar_busy", { busy: false });
    }
  }

  async function undoLastReplace() {
    setLoading("undo");
    await invoke("set_actionbar_busy", { busy: true });
    try {
      await invoke("undo_last_replace");
      setReplaceApplied(false);
      setResultTitle("Undo applied");
      setResultTone("success");
      setStatusMessage("Original text restored.");
      await getCurrentWindow().hide();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Undo error:", e);
      await revealPanel({
        title: "Undo didn’t complete",
        body: message,
        tone: "error",
        status: "If the source app changed state, re-select the text and try again.",
        height: 300,
      });
    } finally {
      setLoading(null);
      await invoke("set_actionbar_busy", { busy: false });
    }
  }

  async function openSettings() {
    await invoke("open_settings_window");
    await getCurrentWindow().hide();
  }

  const actions: DockAction[] = [
    {
      id: "to_english",
      label: "1 To English",
      icon: <Languages size={20} />,
      action: () => runAI("to_english"),
    },
    {
      id: "to_chinese",
      label: "2 To Chinese",
      icon: <BookOpen size={20} />,
      action: () => runAI("to_chinese"),
    },
    {
      id: "expand",
      label: "3 Expand",
      icon: <Maximize2 size={20} />,
      action: () => runAI("expand"),
    },
    {
      id: "save",
      label: "4 Save",
      icon: <Bookmark size={20} />,
      action: handleSave,
    },
    {
      id: "copy",
      label: "5 Copy",
      icon: <Copy size={20} />,
      action: copyText,
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "transparent",
        overflow: "visible",
      }}
    >
      {/* Dock bar */}
      <motion.div
        className="dock-container"
        onMouseMove={(event) => mouseX.set(event.clientX)}
        onMouseLeave={() => {
          mouseX.set(Infinity);
          setHoveredAction(null);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 10px",
          borderRadius: 16,
          background: "var(--surface)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "0.5px solid rgba(128,128,128,0.2)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        }}
      >
        {actions.map((a) => (
          <DockIcon
            key={a.id}
            mouseX={mouseX}
            label={a.label}
            hovered={hoveredAction === a.id}
            isLoading={loading === a.id}
            onHoverChange={(next) => setHoveredAction(next ? a.id : null)}
            onClick={a.action}
          >
            {a.icon}
          </DockIcon>
        ))}
      </motion.div>

      {result && (
        <div
          style={{
            marginTop: 10,
            width: 500,
            maxWidth: "96vw",
            padding: "14px 16px",
            borderRadius: 16,
            background: "var(--surface)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "0.5px solid rgba(128,128,128,0.2)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
              <div
                style={{
                  marginTop: 1,
                  color: resultTone === "error" ? "#dc2626" : resultTone === "success" ? "#16a34a" : "var(--accent)",
                }}
              >
                {resultTone === "error" ? <AlertCircle size={16} /> : <Sparkles size={16} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>
                  {resultTitle || "Result"}
                </div>
                {statusMessage && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      marginTop: 3,
                      lineHeight: 1.45,
                    }}
                  >
                    {statusMessage}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                flexShrink: 0,
                padding: "4px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: resultTone === "error"
                  ? "rgba(220, 38, 38, 0.12)"
                  : resultTone === "success"
                  ? "rgba(22, 163, 74, 0.12)"
                  : "rgba(59, 130, 246, 0.12)",
                color: resultTone === "error"
                  ? "#b91c1c"
                  : resultTone === "success"
                  ? "#15803d"
                  : "var(--accent)",
              }}
            >
              {sourceName}
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 6,
            }}
          >
            Selected text
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              marginBottom: 10,
              lineHeight: 1.5,
              maxHeight: 56,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(127,127,127,0.08)",
            }}
          >
            {text}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 6,
            }}
          >
            {isErrorResult ? "What to do next" : "Output"}
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              maxHeight: 150,
              overflowY: "auto",
              userSelect: "text",
              WebkitUserSelect: "text",
              padding: "10px 12px",
              borderRadius: 12,
              background: isErrorResult ? "rgba(220, 38, 38, 0.06)" : "rgba(127,127,127,0.08)",
              border: isErrorResult ? "1px solid rgba(220, 38, 38, 0.15)" : "1px solid rgba(127,127,127,0.1)",
            }}
          >
            {result}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {!replaceApplied && sel.editable && !isErrorResult && (
              <button
                onClick={() => {
                  void replaceResult();
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {loading === "replace" ? "Replacing..." : "Replace"}
              </button>
            )}
            {replaceApplied && (
              <button
                onClick={() => {
                  void undoLastReplace();
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "white",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {loading === "undo" ? "Undoing..." : "Undo"}
              </button>
            )}
            {showSettingsCta && (
              <button
                onClick={() => {
                  void openSettings();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <ArrowUpRight size={14} />
                Open Settings
              </button>
            )}
            {!isErrorResult && (
              <button
                onClick={copyText}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            <button
              onClick={() => {
                setResult(null);
                setResultTitle(null);
                setResultTone("neutral");
                setShowSettingsCta(false);
                setStatusMessage(null);
                setReplaceApplied(false);
                void resizeActionBarWindow(430, 88);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function getSourceName(selection: Selection): string {
  if (selection.appName?.trim()) {
    return selection.appName;
  }

  if (selection.app?.trim()) {
    const parts = selection.app.split(".");
    return parts[parts.length - 1] || selection.app;
  }

  return "Current app";
}

function actionLabel(actionId: string): string {
  switch (actionId) {
    case "to_english":
      return "To English";
    case "to_chinese":
      return "To Chinese";
    case "expand":
      return "Expand";
    default:
      return actionId;
  }
}

function describeTransformError(message: string): {
  title: string;
  detail: string;
  status: string;
  showSettingsCta: boolean;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("401") || normalized.includes("invalid api key")) {
    return {
      title: "Kimi rejected the API key",
      detail: "Open Settings and verify the API key or host before trying the action again.",
      status: "The request reached Kimi, but authentication failed.",
      showSettingsCta: true,
    };
  }

  if (normalized.includes("429")) {
    return {
      title: "Kimi rate limit reached",
      detail: "Wait a moment, then retry the action. If this keeps happening, switch model or account.",
      status: "The provider accepted the request but is throttling responses right now.",
      showSettingsCta: false,
    };
  }

  if (normalized.includes("request failed") || normalized.includes("timed out")) {
    return {
      title: "Couldn’t reach Kimi",
      detail: "Check your network connection, API host, and provider availability, then try again.",
      status: "No rewrite was generated.",
      showSettingsCta: true,
    };
  }

  return {
    title: "Couldn’t transform this text",
    detail: message,
    status: "The source text is still intact. You can retry or copy the original text.",
    showSettingsCta: false,
  };
}

function describeReplaceError(message: string, sourceName: string): {
  title: string;
  detail: string;
  status: string;
} {
  if (message.includes("selection_mismatch")) {
    return {
      title: "The selection changed before Replace",
      detail: "Re-select the original text, keep it highlighted, then run Replace again.",
      status: `${sourceName} no longer matches the text that was transformed.`,
    };
  }

  if (message.includes("no_valid_selection")) {
    return {
      title: "Seleany couldn’t find a live selection",
      detail: "Keep the original text highlighted in an editable field, then try Replace again.",
      status: `${sourceName} did not expose a valid current selection.`,
    };
  }

  if (message.includes("selection_not_editable")) {
    return {
      title: "This area is read-only",
      detail: "Use Copy instead, or move to an editable text field before trying Replace.",
      status: `${sourceName} allows reading the selection here, but not writing back.`,
    };
  }

  return {
    title: "Replace didn’t complete",
    detail: message,
    status: "The rewritten text is still available to copy.",
  };
}

function DockIcon({
  mouseX,
  children,
  label,
  hovered,
  isLoading,
  onHoverChange,
  onClick,
}: {
  mouseX: MotionValue<number>;
  children: React.ReactNode;
  label: string;
  hovered: boolean;
  isLoading: boolean;
  onHoverChange: (hovered: boolean) => void;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) {
      return DOCK_DISTANCE;
    }
    return value - (bounds.x + bounds.width / 2);
  });
  const size = useSpring(
    useTransform(
      distance,
      [-DOCK_DISTANCE, 0, DOCK_DISTANCE],
      [DOCK_SIZE, DOCK_MAGNIFICATION, DOCK_SIZE]
    ),
    {
      mass: 0.18,
      stiffness: 220,
      damping: 18,
    }
  );

  return (
    <div style={{ position: "relative" }}>
      {hovered && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "3px 8px",
            borderRadius: 6,
            background: "var(--fg)",
            color: "var(--bg)",
            fontSize: 11,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {label}
        </div>
      )}
      <motion.button
        ref={ref}
        type="button"
        className={`dock-icon ${hovered ? "dock-icon-hovered" : ""}`}
        style={{ width: size, height: size }}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        {isLoading ? (
          <Loader2 size={18} className="spin" />
        ) : (
          children
        )}
      </motion.button>
    </div>
  );
}
