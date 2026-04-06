import { useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  Languages,
  BookOpen,
  Maximize2,
  Bookmark,
  Copy,
  ChevronDown,
  ChevronUp,
  MessageSquare,
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
const DOCK_WINDOW_WIDTH = 472;
const DOCK_WINDOW_HEIGHT = 124;
const PANEL_WINDOW_WIDTH = 576;
const WINDOW_SHADOW_BLEED_X = 18;
const WINDOW_SHADOW_BLEED_Y = 20;

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
type ComposerMode = "ask" | "improve";
type ResultKind = "rewrite" | "answer" | "error" | "status";

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
  const [composerMode, setComposerMode] = useState<ComposerMode | null>(null);
  const [composerPrompt, setComposerPrompt] = useState("");
  const [resultCanReplace, setResultCanReplace] = useState(false);
  const [resultKind, setResultKind] = useState<ResultKind>("rewrite");
  const [showSelectedText, setShowSelectedText] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastMeasuredWindowSize = useRef<{ width: number; height: number } | null>(null);
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
      setComposerMode(null);
      setComposerPrompt("");
      setResultCanReplace(false);
      setResultKind("rewrite");
      setShowSelectedText(false);
      mouseX.set(Infinity);
      void resizeActionBarWindow(DOCK_WINDOW_WIDTH, DOCK_WINDOW_HEIGHT);
    });

    return () => {
      html.classList.remove("actionbar-window");
      body.classList.remove("actionbar-window");
      root?.classList.remove("actionbar-window");
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!composerMode) {
      return;
    }

    const id = window.setTimeout(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(
        composerRef.current.value.length,
        composerRef.current.value.length
      );
    }, 40);

    return () => window.clearTimeout(id);
  }, [composerMode]);

  async function resizeActionBarWindow(width: number, height: number) {
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    await getCurrentWindow().setSize(new LogicalSize(width, height));
  }

  useEffect(() => {
    const node = contentRef.current;
    if (!node) {
      return;
    }

    let frame = 0;

    const syncWindowToContent = () => {
      const width = Math.ceil(node.scrollWidth + WINDOW_SHADOW_BLEED_X);
      const height = Math.ceil(node.scrollHeight + WINDOW_SHADOW_BLEED_Y);
      const last = lastMeasuredWindowSize.current;

      if (last && Math.abs(last.width - width) < 2 && Math.abs(last.height - height) < 2) {
        return;
      }

      lastMeasuredWindowSize.current = { width, height };
      void resizeActionBarWindow(width, height);
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncWindowToContent);
    };

    scheduleSync();

    const observer = new ResizeObserver(() => {
      scheduleSync();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [composerMode, result, resultTitle, resultTone, showSelectedText, statusMessage, showSettingsCta, replaceApplied, loading]);

  async function revealPanel({
    title,
    body,
    tone = "neutral",
    status = null,
    showSettings = false,
    height = 340,
    canReplace = false,
    kind = "rewrite",
  }: {
    title: string;
    body: string;
    tone?: ResultTone;
    status?: string | null;
    showSettings?: boolean;
    height?: number;
    canReplace?: boolean;
    kind?: ResultKind;
  }) {
    setResultTitle(title);
    setResult(body);
    setResultTone(tone);
    setStatusMessage(status);
    setShowSettingsCta(showSettings);
    setResultCanReplace(canReplace);
    setResultKind(kind);
    setShowSelectedText(false);
    setComposerMode(null);
    await resizeActionBarWindow(PANEL_WINDOW_WIDTH, height);
    await getCurrentWindow().show();
  }

  function resetInlinePanels() {
    setResult(null);
    setResultTitle(null);
    setResultTone("neutral");
    setShowSettingsCta(false);
    setStatusMessage(null);
    setReplaceApplied(false);
    setResultCanReplace(false);
    setResultKind("rewrite");
    setShowSelectedText(false);
  }

  async function collapseToDock() {
    setComposerMode(null);
    setComposerPrompt("");
    resetInlinePanels();
    await resizeActionBarWindow(DOCK_WINDOW_WIDTH, DOCK_WINDOW_HEIGHT);
  }

  async function loadAIConfig() {
    const apiKey = await invoke<string | null>("get_setting", {
      key: "kimi_api_key",
    });
    const apiHost = await invoke<string | null>("get_setting", {
      key: "kimi_api_host",
    });
    const model = await invoke<string | null>("get_setting", {
      key: "kimi_model",
    });

    return {
      apiKey: (apiKey || "").trim(),
      apiHost: apiHost || "api.moonshot.cn",
      model: model || "moonshot-v1-8k",
    };
  }

  async function openComposer(mode: ComposerMode) {
    setComposerMode(mode);
    setComposerPrompt("");
    setCopied(false);
    resetInlinePanels();
    setStatusMessage(null);
    await resizeActionBarWindow(PANEL_WINDOW_WIDTH, 286);
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
        if (composerMode) {
          void collapseToDock();
        } else {
          void getCurrentWindow().hide();
        }
        return;
      }

      if (composerMode && key === "enter" && !e.shiftKey) {
        e.preventDefault();
        void runCustomAI();
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

      if (result && !replaceApplied && !isErrorResult && resultCanReplace && e.key === "Enter") {
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
          void openComposer("ask");
          break;
        case "5":
          e.preventDefault();
          void handleSave();
          break;
        case "6":
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
  }, [composerMode, composerPrompt, isErrorResult, loading, replaceApplied, result, resultCanReplace]);

  async function runAI(actionId: string) {
    setLoading(actionId);
    setCopied(false);
    setReplaceApplied(false);
    setStatusMessage(null);
    await invoke("set_actionbar_busy", { busy: true });
    try {
      const config = await loadAIConfig();

      if (!config.apiKey) {
        await revealPanel({
          title: "Kimi API key is missing",
          body: "Open Settings from the menu bar and add your Kimi key before running To English, To Chinese, or Expand.",
          tone: "error",
          status: "AI actions stay unavailable until the key is configured.",
          showSettings: true,
          height: 300,
          kind: "error",
        });
        return;
      }

      const output = await invoke<string>("transform_text", {
        text,
        action: actionId,
        apiKey: config.apiKey,
        apiHost: config.apiHost,
        model: config.model,
      });

      // Save transform to db
      try {
        const sentenceId = await dbSave(text, app || null, url || null);
        await saveTransform(sentenceId, actionId, text, output, config.model);
      } catch (_) { /* best effort */ }

      await revealPanel({
        title: `${actionLabel(actionId)} ready`,
        body: output,
        tone: "neutral",
        status: sel.editable
          ? `${sourceName} is editable here. Press Enter or click Replace to write back.`
          : `${sourceName} is read-only here. Copy is available, but Replace stays hidden.`,
        height: 360,
        canReplace: sel.editable,
        kind: "rewrite",
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
        kind: "error",
      });
      setReplaceApplied(false);
    } finally {
      setLoading(null);
      await invoke("set_actionbar_busy", { busy: false });
    }
  }

  async function runCustomAI() {
    if (!composerMode) {
      return;
    }

    const instruction = composerPrompt.trim();
    if (!instruction) {
      setStatusMessage("Enter a question or rewrite instruction first.");
      return;
    }

    setLoading("custom_ai");
    setCopied(false);
    setReplaceApplied(false);
    setStatusMessage(null);
    await invoke("set_actionbar_busy", { busy: true });
    try {
      const config = await loadAIConfig();

      if (!config.apiKey) {
        await revealPanel({
          title: "Kimi API key is missing",
          body: "Open Settings from the menu bar and add your Kimi key before using Ask AI or Improve.",
          tone: "error",
          status: "Custom AI actions stay unavailable until the key is configured.",
          showSettings: true,
          height: 300,
          kind: "error",
        });
        return;
      }

      const output = await invoke<string>("custom_text_action", {
        text,
        mode: composerMode,
        instruction,
        apiKey: config.apiKey,
        apiHost: config.apiHost,
        model: config.model,
      });

      try {
        const sentenceId = await dbSave(text, app || null, url || null);
        await saveTransform(
          sentenceId,
          composerMode === "ask" ? "ask_ai" : "improve_custom",
          text,
          output,
          config.model
        );
      } catch (_) { /* best effort */ }

      const canReplace = composerMode === "improve" && sel.editable;
      await revealPanel({
        title: composerMode === "ask" ? "Answer ready" : "Improved text ready",
        body: output,
        tone: "neutral",
        status: composerMode === "ask"
          ? "This result answers your question about the selected text. Copy is available."
          : sel.editable
          ? `${sourceName} is editable here. Press Enter or click Replace to write back.`
          : `${sourceName} is read-only here. Copy is available, but Replace stays hidden.`,
        height: 380,
        canReplace,
        kind: composerMode === "ask" ? "answer" : "rewrite",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Custom AI error:", e);
      const friendly = describeTransformError(message);
      await revealPanel({
        title: friendly.title,
        body: friendly.detail,
        tone: "error",
        status: friendly.status,
        showSettings: friendly.showSettingsCta,
        height: 320,
        kind: "error",
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
        kind: "error",
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
      setResultKind("status");
      setShowSelectedText(false);
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
      setResultKind("error");
      setStatusMessage(friendly.status);
      setShowSettingsCta(false);
      setReplaceApplied(false);
      await resizeActionBarWindow(PANEL_WINDOW_WIDTH, 348);
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
        kind: "error",
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
      id: "custom_ai",
      label: "4 Ask / Improve",
      icon: <MessageSquare size={20} />,
      action: () => openComposer("ask"),
    },
    {
      id: "save",
      label: "5 Save",
      icon: <Bookmark size={20} />,
      action: handleSave,
    },
    {
      id: "copy",
      label: "6 Copy",
      icon: <Copy size={20} />,
      action: copyText,
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      <div
        ref={contentRef}
        style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 8,
        width: "fit-content",
        maxWidth: "100%",
        padding: "28px 16px 18px",
        boxSizing: "border-box",
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
          gap: 5,
          padding: "7px 12px",
          borderRadius: 20,
          background: "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.76))",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.78)",
          boxShadow: "0 10px 22px rgba(15,23,42,0.09), 0 2px 6px rgba(15,23,42,0.05)",
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

      {composerMode && !result && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{
            width: 504,
            maxWidth: "96vw",
            padding: "16px 16px 14px",
            borderRadius: 22,
            background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.84))",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.72)",
            boxShadow: "0 20px 36px rgba(15,23,42,0.14), 0 6px 14px rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 9px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  color: "var(--accent)",
                  background: "rgba(59,130,246,0.1)",
                  marginBottom: 8,
                }}
              >
                <MessageSquare size={12} />
                {composerMode === "ask" ? "ASK AI" : "IMPROVE"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>
                {composerMode === "ask" ? "Ask about this text" : "Improve this text"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                {composerMode === "ask"
                  ? `Ask for an explanation, answer, or insight based on the selected text from ${sourceName}.`
                  : `Describe exactly how the selected text from ${sourceName} should be rewritten.`}
              </div>
            </div>
            <div
              style={{
                display: "inline-flex",
                gap: 6,
                padding: 4,
                borderRadius: 999,
                background: "rgba(15,23,42,0.06)",
              }}
            >
              <button
                type="button"
                onClick={() => setComposerMode("ask")}
                style={composerTabStyle(composerMode === "ask")}
              >
                Ask
              </button>
              <button
                type="button"
                onClick={() => setComposerMode("improve")}
                style={composerTabStyle(composerMode === "improve")}
              >
                Improve
              </button>
            </div>
          </div>

          <textarea
            ref={composerRef}
            value={composerPrompt}
            onChange={(event) => {
              setComposerPrompt(event.target.value);
              if (statusMessage) {
                setStatusMessage(null);
              }
            }}
            placeholder={composerPlaceholder(composerMode)}
            rows={4}
            style={{
              width: "100%",
              resize: "none",
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.24)",
              background: "rgba(255,255,255,0.82)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
              padding: "12px 13px",
              color: "var(--fg)",
              fontSize: 13,
              lineHeight: 1.55,
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          {statusMessage && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "var(--muted)",
                lineHeight: 1.45,
              }}
            >
              {statusMessage}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {composerSuggestions(composerMode).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setComposerPrompt(suggestion)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(255,255,255,0.82)",
                  color: "var(--fg)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {composerMode === "ask"
                ? "Press Enter to ask. Shift+Enter inserts a new line."
                : "Press Enter to generate a rewrite you can copy or replace."}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  void collapseToDock();
                }}
                style={secondaryButtonStyle()}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void runCustomAI();
                }}
                style={primaryButtonStyle()}
              >
                {loading === "custom_ai"
                  ? composerMode === "ask" ? "Asking..." : "Improving..."
                  : composerMode === "ask" ? "Ask AI" : "Run Improve"}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{
            width: 512,
            maxWidth: "96vw",
            padding: "16px 16px 14px",
            borderRadius: 22,
            background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,252,0.86))",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.72)",
            boxShadow: "0 20px 36px rgba(15,23,42,0.16), 0 6px 14px rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
              <div
                style={{
                  marginTop: 1,
                  color: resultTone === "error" ? "#dc2626" : resultTone === "success" ? "#16a34a" : "var(--accent)",
                }}
              >
                {resultTone === "error" ? <AlertCircle size={16} /> : <Sparkles size={16} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <div style={resultBadgeStyle(resultKind, resultTone)}>
                    {resultBadgeLabel(resultKind)}
                  </div>
                  <div style={capabilityBadgeStyle(resultKind, resultCanReplace, replaceApplied, isErrorResult)}>
                    {capabilityBadgeLabel(resultKind, resultCanReplace, replaceApplied, isErrorResult)}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>
                  {resultTitle || "Result"}
                </div>
                {statusMessage && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      marginTop: 5,
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
                padding: "5px 9px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(15,23,42,0.06)",
                color: "var(--muted)",
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
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            {isErrorResult ? "Details" : "Output"}
          </div>
          <div
            style={{
              fontSize: isErrorResult ? 14 : 15,
              lineHeight: 1.72,
              whiteSpace: "pre-wrap",
              maxHeight: 164,
              overflowY: "auto",
              userSelect: "text",
              WebkitUserSelect: "text",
              padding: "14px 14px",
              borderRadius: 16,
              background: isErrorResult
                ? "linear-gradient(180deg, rgba(254,242,242,0.92), rgba(254,226,226,0.82))"
                : "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(241,245,249,0.86))",
              border: isErrorResult
                ? "1px solid rgba(220, 38, 38, 0.12)"
                : "1px solid rgba(148,163,184,0.14)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
            }}
          >
            {result}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 14,
            }}
          >
            <button
              type="button"
              onClick={() => setShowSelectedText((open) => !open)}
              style={selectedTextToggleStyle(showSelectedText)}
            >
              {showSelectedText ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showSelectedText ? "Hide Selected Text" : "Show Selected Text"}
            </button>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
              {!replaceApplied && resultCanReplace && !isErrorResult && (
                <button
                  onClick={() => {
                    void replaceResult();
                  }}
                  style={primaryButtonStyle()}
                >
                  {loading === "replace" ? "Replacing..." : "Replace"}
                </button>
              )}
              {replaceApplied && (
                <button
                  onClick={() => {
                    void undoLastReplace();
                  }}
                  style={primaryButtonStyle("#111827")}
                >
                  {loading === "undo" ? "Undoing..." : "Undo"}
                </button>
              )}
              {showSettingsCta && (
                <button
                  onClick={() => {
                    void openSettings();
                  }}
                  style={secondaryButtonStyle()}
                >
                  <ArrowUpRight size={14} />
                  Open Settings
                </button>
              )}
              {!isErrorResult && (
                <button
                  onClick={copyText}
                  style={secondaryButtonStyle()}
                >
                  {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
              <button
                onClick={() => {
                  void collapseToDock();
                }}
                style={secondaryButtonStyle()}
              >
                Done
              </button>
            </div>
          </div>
          {showSelectedText && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 13px",
                borderRadius: 14,
                background: "rgba(241,245,249,0.82)",
                border: "1px solid rgba(148,163,184,0.14)",
                fontSize: 12,
                color: "var(--muted)",
                lineHeight: 1.58,
                whiteSpace: "pre-wrap",
                maxHeight: 92,
                overflowY: "auto",
              }}
            >
              {text}
            </div>
          )}
        </motion.div>
      )}

      </div>
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

function composerPlaceholder(mode: ComposerMode): string {
  return mode === "ask"
    ? "Ask a question about the selected text. Example: What is the main argument here?"
    : "Describe how to rewrite the selected text. Example: Make this more concise and professional.";
}

function composerSuggestions(mode: ComposerMode): string[] {
  return mode === "ask"
    ? [
      "What is the main point of this text?",
      "Explain this in simpler language.",
      "What should I pay attention to here?",
    ]
    : [
      "Make this more concise and professional.",
      "Rewrite this in natural English.",
      "Turn this into a clearer, more persuasive version.",
    ];
}

function composerTabStyle(active: boolean): CSSProperties {
  return {
    padding: "5px 12px",
    borderRadius: 999,
    border: "none",
    background: active ? "var(--fg)" : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function primaryButtonStyle(background = "var(--accent)"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 10,
    border: "none",
    background,
    color: "white",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(15,23,42,0.12)",
  };
}

function secondaryButtonStyle(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 13px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(255,255,255,0.82)",
    color: "var(--fg)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };
}

function selectedTextToggleStyle(open: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 11px",
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.16)",
    background: open ? "rgba(226,232,240,0.68)" : "rgba(255,255,255,0.72)",
    color: "var(--muted)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function resultBadgeLabel(kind: ResultKind): string {
  switch (kind) {
    case "answer":
      return "Ask AI";
    case "rewrite":
      return "Rewrite";
    case "status":
      return "Applied";
    case "error":
      return "Issue";
    default:
      return "Result";
  }
}

function resultBadgeStyle(kind: ResultKind, tone: ResultTone): CSSProperties {
  const palette =
    tone === "error"
      ? { bg: "rgba(220,38,38,0.12)", fg: "#b91c1c" }
      : tone === "success"
      ? { bg: "rgba(22,163,74,0.12)", fg: "#15803d" }
      : kind === "answer"
      ? { bg: "rgba(14,165,233,0.12)", fg: "#0369a1" }
      : { bg: "rgba(59,130,246,0.12)", fg: "var(--accent)" };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 9px",
    borderRadius: 999,
    background: palette.bg,
    color: palette.fg,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.03em",
  };
}

function capabilityBadgeLabel(
  kind: ResultKind,
  canReplace: boolean,
  replaceApplied: boolean,
  isError: boolean
): string {
  if (isError) {
    return "Needs attention";
  }
  if (replaceApplied) {
    return "Undo available";
  }
  if (kind === "answer") {
    return "Copy only";
  }
  return canReplace ? "Replace available" : "Copy only";
}

function capabilityBadgeStyle(
  kind: ResultKind,
  canReplace: boolean,
  replaceApplied: boolean,
  isError: boolean
): CSSProperties {
  const label = capabilityBadgeLabel(kind, canReplace, replaceApplied, isError);
  const palette =
    label === "Replace available"
      ? { bg: "rgba(22,163,74,0.1)", fg: "#15803d" }
      : label === "Undo available"
      ? { bg: "rgba(15,23,42,0.08)", fg: "#111827" }
      : label === "Needs attention"
      ? { bg: "rgba(220,38,38,0.08)", fg: "#b91c1c" }
      : { bg: "rgba(148,163,184,0.14)", fg: "var(--muted)" };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 9px",
    borderRadius: 999,
    background: palette.bg,
    color: palette.fg,
    fontSize: 11,
    fontWeight: 700,
  };
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
