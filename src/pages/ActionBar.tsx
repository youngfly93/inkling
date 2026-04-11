import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { saveSentence as dbSave, saveTransform } from "../services/db";

const DOCK_SIZE = 28;
const DOCK_MAGNIFICATION = 48;
const DOCK_DISTANCE = 120;
const ORB_WINDOW_WIDTH = 18;
const ORB_WINDOW_HEIGHT = 18;
const DOCK_WINDOW_WIDTH = 340;
const DOCK_WINDOW_HEIGHT = 84;
const PANEL_WINDOW_WIDTH = 576;
const WINDOW_SHADOW_BLEED_X = 18;
const WINDOW_SHADOW_BLEED_Y = 20;
const ORB_SHADOW_BLEED_X = 4;
const ORB_SHADOW_BLEED_Y = 4;

interface Selection {
  text: string;
  app: string;
  appName?: string;
  url: string;
  editable: boolean;
  mouseX?: number;
  mouseY?: number;
  anchorX?: number;
  anchorY?: number;
}

interface CursorPosition {
  x: number;
  y: number;
}

interface DockAction {
  id: string;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  /** Hex accent used when the icon is hovered/magnified. */
  accent: string;
  /** Semantic grouping — used to render the divider between AI and utility. */
  group: "ai" | "util";
}

type ResultTone = "neutral" | "success" | "warning" | "error";
type ComposerMode = "ask" | "improve";
type ResultKind = "rewrite" | "answer" | "error" | "status";
type SurfaceMode = "orb" | "dock";

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
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("orb");
  const [orbHovered, setOrbHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const dockItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Cached dock geometry — refreshed only on layout changes so the hover
  // sync path never calls getBoundingClientRect per frame.
  const dockMetricsRef = useRef<{
    bounds: { left: number; right: number; top: number; bottom: number } | null;
    items: Array<{ id: string; centerX: number }>;
  }>({ bounds: null, items: [] });
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastMeasuredWindowSize = useRef<{ width: number; height: number } | null>(null);
  // -10000 keeps the spring math defined while sitting well outside any dock
  // layout; Infinity produces NaN once the spring does subtraction against it.
  const mouseX = useMotionValue(-10000);
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
      .then((selection) => {
        setSel(selection);
        setSurfaceMode("orb");
        setOrbHovered(false);
        clearDockHover();
      })
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
      setSurfaceMode("orb");
      setOrbHovered(false);
      clearDockHover();
      void resizeActionBarWindow(ORB_WINDOW_WIDTH, ORB_WINDOW_HEIGHT);
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

  // Refresh cached dock geometry whenever the dock is actually mounted
  // (surfaceMode="dock") and on layout changes. We measure in the next frame
  // so the initial measurement sees the final layout (after spring settles).
  useEffect(() => {
    if (surfaceMode !== "dock") {
      dockMetricsRef.current = { bounds: null, items: [] };
      return;
    }
    const dockNode = dockRef.current;
    if (!dockNode) return;

    let rafId = 0;
    const schedule = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        recomputeDockMetrics();
      });
    };

    // Initial measurement after the next paint — gives the dock time to
    // render at its rest size before we read bounds.
    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(dockNode);
    for (const node of Object.values(dockItemRefs.current)) {
      if (node) ro.observe(node);
    }

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [surfaceMode, composerMode, result]);

  async function resizeActionBarWindow(
    width: number,
    height: number,
    options?: { anchor?: "center" | "bottom-left" }
  ) {
    const win = getCurrentWindow();
    const { LogicalSize, PhysicalPosition } = await import("@tauri-apps/api/dpi");

    if (options?.anchor === "center" || options?.anchor === "bottom-left") {
      const [outerPos, innerSize, scaleFactor] = await Promise.all([
        win.outerPosition(),
        win.innerSize(),
        win.scaleFactor(),
      ]);
      const currentLogical = innerSize.toLogical(scaleFactor);
      const deltaX =
        options.anchor === "center"
          ? ((width - currentLogical.width) * scaleFactor) / 2
          : 0;
      const deltaY =
        options.anchor === "center"
          ? ((height - currentLogical.height) * scaleFactor) / 2
          : (height - currentLogical.height) * scaleFactor;

      await win.setSize(new LogicalSize(width, height));
      await win.setPosition(
        new PhysicalPosition(
          Math.round(outerPos.x - deltaX),
          Math.round(outerPos.y - deltaY)
        )
      );
      return;
    }

    await win.setSize(new LogicalSize(width, height));
  }

  // Stable — DockIcon is memoized and would otherwise re-render every parent tick.
  const setDockItemRef = useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      dockItemRefs.current[id] = node;
    },
    []
  );

  // Refresh the cached dock bounds + each icon's rest-position center.
  // Called from the ResizeObserver below and once after the dock expands.
  function recomputeDockMetrics() {
    const dockNode = dockRef.current;
    if (!dockNode) {
      dockMetricsRef.current = { bounds: null, items: [] };
      return;
    }
    const rect = dockNode.getBoundingClientRect();
    const items: Array<{ id: string; centerX: number }> = [];
    for (const [id, node] of Object.entries(dockItemRefs.current)) {
      if (!node) continue;
      const b = node.getBoundingClientRect();
      items.push({ id, centerX: b.x + b.width / 2 });
    }
    dockMetricsRef.current = {
      bounds: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      items,
    };
  }

  function clearDockHover() {
    // -Infinity would taint the spring with NaN; park it far to the left instead.
    mouseX.set(-10000);
    setHoveredAction(null);
  }

  function syncDockHoverFromClientPoint(clientX: number, clientY: number) {
    const metrics = dockMetricsRef.current;
    const bounds = metrics.bounds;
    if (!bounds) {
      clearDockHover();
      return;
    }

    const withinX = clientX >= bounds.left - 18 && clientX <= bounds.right + 18;
    const withinY = clientY >= bounds.top - 10 && clientY <= bounds.bottom + 12;

    if (!withinX || !withinY) {
      clearDockHover();
      return;
    }

    const items = metrics.items;
    if (!items.length) {
      mouseX.set(clientX);
      return;
    }

    let nearestId: string | null = null;
    let nearestCenter = clientX;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const item of items) {
      const distance = Math.abs(clientX - item.centerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCenter = item.centerX;
        nearestId = item.id;
      }
    }

    mouseX.set(nearestCenter);
    setHoveredAction(nearestId);
  }

  async function syncDockHoverFromSelection(selection: Selection) {
    if (selection.mouseX == null || selection.mouseY == null) {
      clearDockHover();
      return;
    }

    const win = getCurrentWindow();

    const applyPointerState = async () => {
      const [outerPos, scaleFactor] = await Promise.all([
        win.outerPosition(),
        win.scaleFactor(),
      ]);

      const clientX = (selection.mouseX! - outerPos.x) / scaleFactor;
      const clientY = (selection.mouseY! - outerPos.y) / scaleFactor;
      syncDockHoverFromClientPoint(clientX, clientY);
    };

    window.requestAnimationFrame(() => {
      void applyPointerState();
      window.requestAnimationFrame(() => {
        void applyPointerState();
      });
    });
  }

  useEffect(() => {
    const node = contentRef.current;
    if (!node) {
      return;
    }

    let frame = 0;

    const syncWindowToContent = () => {
      const bleedX = surfaceMode === "orb" && !composerMode && !result
        ? ORB_SHADOW_BLEED_X
        : WINDOW_SHADOW_BLEED_X;
      const bleedY = surfaceMode === "orb" && !composerMode && !result
        ? ORB_SHADOW_BLEED_Y
        : WINDOW_SHADOW_BLEED_Y;
      const width = Math.ceil(node.scrollWidth + bleedX);
      const height = Math.ceil(node.scrollHeight + bleedY);
      const last = lastMeasuredWindowSize.current;

      if (last && Math.abs(last.width - width) < 2 && Math.abs(last.height - height) < 2) {
        return;
      }

      lastMeasuredWindowSize.current = { width, height };
      void resizeActionBarWindow(width, height, { anchor: "bottom-left" });
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
  }, [surfaceMode, composerMode, result, resultTitle, resultTone, showSelectedText, statusMessage, showSettingsCta, replaceApplied, loading]);

  useEffect(() => {
    if (surfaceMode !== "dock" || composerMode || result) {
      clearDockHover();
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const win = getCurrentWindow();

    const pollCursor = async () => {
      if (cancelled || inFlight || !dockRef.current) {
        return;
      }

      inFlight = true;
      try {
        const [cursor, outerPos, scaleFactor] = await Promise.all([
          invoke<CursorPosition>("get_cursor_position"),
          win.outerPosition(),
          win.scaleFactor(),
        ]);

        if (cancelled) {
          return;
        }

        const clientX = (cursor.x - outerPos.x) / scaleFactor;
        const clientY = (cursor.y - outerPos.y) / scaleFactor;
        syncDockHoverFromClientPoint(clientX, clientY);
      } catch {
        // Ignore transient window or cursor lookup errors while the action bar is hidden/repositioning.
      } finally {
        inFlight = false;
      }
    };

    void pollCursor();
    const interval = window.setInterval(() => {
      void pollCursor();
    }, 70);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [surfaceMode, composerMode, result]);

  useEffect(() => {
    if (surfaceMode !== "orb" || orbHovered || loading || composerMode || result || !sel.text.trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void getCurrentWindow().hide();
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [surfaceMode, orbHovered, loading, composerMode, result, sel.text]);

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
    setSurfaceMode("dock");
    setOrbHovered(false);
    setResultTitle(title);
    setResult(body);
    setResultTone(tone);
    setStatusMessage(status);
    setShowSettingsCta(showSettings);
    setResultCanReplace(canReplace);
    setResultKind(kind);
    setShowSelectedText(false);
    setComposerMode(null);
    await resizeActionBarWindow(PANEL_WINDOW_WIDTH, height, { anchor: "bottom-left" });
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

  async function expandDock() {
    setSurfaceMode("dock");
    setOrbHovered(false);
    await resizeActionBarWindow(DOCK_WINDOW_WIDTH, DOCK_WINDOW_HEIGHT, { anchor: "bottom-left" });
    await getCurrentWindow().show();
    await syncDockHoverFromSelection(sel);
  }

  async function collapseToOrb() {
    setComposerMode(null);
    setComposerPrompt("");
    resetInlinePanels();
    clearDockHover();
    setOrbHovered(false);
    setSurfaceMode("orb");
    await resizeActionBarWindow(ORB_WINDOW_WIDTH, ORB_WINDOW_HEIGHT, { anchor: "bottom-left" });
    await getCurrentWindow().show();
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
    setSurfaceMode("dock");
    setOrbHovered(false);
    setComposerMode(mode);
    setComposerPrompt("");
    setCopied(false);
    resetInlinePanels();
    setStatusMessage(null);
    await resizeActionBarWindow(PANEL_WINDOW_WIDTH, 286, { anchor: "bottom-left" });
    await getCurrentWindow().show();
  }

  useEffect(() => {
    const onBlur = () => {
      setHoveredAction(null);
      setOrbHovered(false);
      mouseX.set(-10000);
    };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (key === "escape") {
        e.preventDefault();
        if (composerMode || result || surfaceMode === "dock") {
          void collapseToOrb();
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
  }, [composerMode, composerPrompt, isErrorResult, loading, replaceApplied, result, resultCanReplace, surfaceMode]);

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
      await resizeActionBarWindow(PANEL_WINDOW_WIDTH, 348, { anchor: "bottom-left" });
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

  // Stable dispatchers so DockIcon (React.memo) never re-renders from callback
  // identity churn. The actual handlers live in a ref so we can call the latest
  // closure without tracking every dependency.
  const actionHandlersRef = useRef<Record<string, () => void>>({});
  actionHandlersRef.current = {
    to_english: () => runAI("to_english"),
    to_chinese: () => runAI("to_chinese"),
    expand: () => runAI("expand"),
    custom_ai: () => openComposer("ask"),
    save: () => void handleSave(),
    copy: copyText,
  };

  const handleActionClick = useCallback((id: string) => {
    actionHandlersRef.current[id]?.();
  }, []);

  const handleActionHover = useCallback((id: string, next: boolean) => {
    setHoveredAction(next ? id : null);
  }, []);

  const actions: DockAction[] = [
    {
      id: "to_english",
      label: "To English",
      shortcut: "1",
      accent: "#2563eb", // blue — language
      group: "ai",
      icon: <Languages size={16} />,
    },
    {
      id: "to_chinese",
      label: "To Chinese",
      shortcut: "2",
      accent: "#0891b2", // cyan — language
      group: "ai",
      icon: <BookOpen size={16} />,
    },
    {
      id: "expand",
      label: "Expand",
      shortcut: "3",
      accent: "#7c3aed", // violet — rewrite
      group: "ai",
      icon: <Maximize2 size={16} />,
    },
    {
      id: "custom_ai",
      label: "Ask / Improve",
      shortcut: "4",
      accent: "#db2777", // pink — custom
      group: "ai",
      icon: <MessageSquare size={16} />,
    },
    {
      id: "save",
      label: "Save",
      shortcut: "5",
      accent: "#d97706", // amber — persistence
      group: "util",
      icon: <Bookmark size={16} />,
    },
    {
      id: "copy",
      label: "Copy",
      shortcut: "6",
      accent: "#059669", // emerald — quick action
      group: "util",
      icon: <Copy size={16} />,
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
          padding:
            surfaceMode === "orb" && !composerMode && !result
              ? "0"
              : "16px 10px 10px",
          boxSizing: "border-box",
          background: "transparent",
          overflow: "visible",
      }}
    >
      {!composerMode && !result && surfaceMode === "orb" ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.72 }}
          animate={{ opacity: 1, scale: orbHovered ? 1.12 : 1 }}
          transition={{
            type: "spring",
            mass: 0.25,
            stiffness: 520,
            damping: 26,
          }}
          onMouseEnter={() => setOrbHovered(true)}
          onMouseLeave={() => setOrbHovered(false)}
          onClick={() => {
            void expandDock();
          }}
          style={{
            position: "relative",
            width: 10,
            height: 10,
            borderRadius: 999,
            border: "none",
            background: "#111827",
            boxShadow: orbHovered
              ? "0 4px 10px rgba(15,23,42,0.22)"
              : "0 3px 8px rgba(15,23,42,0.18)",
            cursor: "pointer",
            padding: 0,
            display: "grid",
            placeItems: "center",
            willChange: "transform",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
        />
      ) : (
        <motion.div
          ref={dockRef}
          className="dock-container"
          onMouseMove={(event) => syncDockHoverFromClientPoint(event.clientX, event.clientY)}
          onMouseEnter={(event) => syncDockHoverFromClientPoint(event.clientX, event.clientY)}
          onMouseLeave={clearDockHover}
          initial={{ opacity: 0, scale: 0.94, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            type: "spring",
            mass: 0.3,
            stiffness: 360,
            damping: 26,
          }}
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            padding: "5px 8px 6px",
            borderRadius: 18,
            background: "linear-gradient(180deg, rgba(255,255,255,0.985), rgba(248,250,252,0.96))",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(226,232,240,0.96)",
            boxShadow: "0 10px 22px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.94)",
            willChange: "transform",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
        >
          {actions.map((a, idx) => {
            const prev = actions[idx - 1];
            const showDivider = !!prev && prev.group !== a.group;
            return (
              <React.Fragment key={a.id}>
                {showDivider && (
                  <div
                    aria-hidden="true"
                    style={{
                      alignSelf: "center",
                      width: 1,
                      height: 18,
                      margin: "0 2px",
                      background:
                        "linear-gradient(180deg, rgba(15,23,42,0.02), rgba(15,23,42,0.14), rgba(15,23,42,0.02))",
                    }}
                  />
                )}
                <DockIcon
                  id={a.id}
                  mouseX={mouseX}
                  label={a.label}
                  shortcut={a.shortcut}
                  accent={a.accent}
                  hovered={hoveredAction === a.id}
                  isLoading={loading === a.id}
                  onHoverChange={handleActionHover}
                  setButtonRef={setDockItemRef}
                  onClick={handleActionClick}
                >
                  {a.icon}
                </DockIcon>
              </React.Fragment>
            );
          })}
        </motion.div>
      )}

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
            background: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.965))",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(226,232,240,0.94)",
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
                  background: "rgba(59,130,246,0.12)",
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
                background: "rgba(15,23,42,0.08)",
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
              background: "rgba(255,255,255,0.97)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
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
                  background: "rgba(255,255,255,0.94)",
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
                  void collapseToOrb();
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
            background: "linear-gradient(180deg, rgba(255,255,255,0.992), rgba(248,250,252,0.972))",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(226,232,240,0.95)",
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
                background: "rgba(15,23,42,0.08)",
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
                ? "linear-gradient(180deg, rgba(254,242,242,0.98), rgba(254,226,226,0.94))"
                : "linear-gradient(180deg, rgba(255,255,255,0.985), rgba(241,245,249,0.965))",
              border: isErrorResult
                ? "1px solid rgba(220, 38, 38, 0.18)"
                : "1px solid rgba(148,163,184,0.18)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
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
                  void collapseToOrb();
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
                background: "rgba(241,245,249,0.96)",
                border: "1px solid rgba(148,163,184,0.18)",
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

const DockIcon = React.memo(function DockIcon({
  id,
  mouseX,
  children,
  label,
  shortcut,
  accent,
  hovered,
  isLoading,
  onHoverChange,
  setButtonRef,
  onClick,
}: {
  id: string;
  mouseX: MotionValue<number>;
  children: React.ReactNode;
  label: string;
  shortcut: string;
  accent: string;
  hovered: boolean;
  isLoading: boolean;
  /** Stable dispatcher — receives the id so parent can keep one callback. */
  onHoverChange: (id: string, hovered: boolean) => void;
  setButtonRef: (id: string, node: HTMLButtonElement | null) => void;
  onClick: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const centerXRef = useRef<number>(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const bounds = node.getBoundingClientRect();
      centerXRef.current = bounds.x + bounds.width / 2;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    if (node.parentElement) ro.observe(node.parentElement);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const distance = useTransform(mouseX, (value) => value - centerXRef.current);
  const size = useSpring(
    useTransform(
      distance,
      [-DOCK_DISTANCE, 0, DOCK_DISTANCE],
      [DOCK_SIZE, DOCK_MAGNIFICATION, DOCK_SIZE]
    ),
    {
      mass: 0.12,
      stiffness: 300,
      damping: 22,
    }
  );
  const lift = useTransform(size, [DOCK_SIZE, DOCK_MAGNIFICATION], [0, -6]);
  const iconScale = useTransform(size, [DOCK_SIZE, DOCK_MAGNIFICATION], [1, 1.12]);
  const setMouseToCenter = () => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return;
    mouseX.set(bounds.x + bounds.width / 2);
  };

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "flex-end" }}>
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{
              type: "spring",
              mass: 0.2,
              stiffness: 420,
              damping: 26,
            }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 10px)",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 6px 4px 10px",
              borderRadius: 10,
              background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(226,232,240,0.95)",
              color: "#111827",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 10,
              boxShadow: "0 8px 18px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}
          >
            <span>{label}</span>
            <kbd
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 14,
                height: 14,
                padding: "0 4px",
                borderRadius: 4,
                background: "rgba(15,23,42,0.08)",
                color: "#475569",
                fontSize: 9,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {shortcut}
            </kbd>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        ref={(node) => {
          ref.current = node;
          setButtonRef(id, node);
        }}
        type="button"
        className={`dock-icon ${hovered ? "dock-icon-hovered" : ""}`}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", mass: 0.15, stiffness: 600, damping: 22 }}
        style={{
          width: size,
          height: size,
          y: lift,
          color: hovered ? accent : "var(--fg)",
          borderColor: hovered ? `${accent}4d` : undefined, // ~30% alpha
          willChange: "width, height, transform",
          backfaceVisibility: "hidden",
        }}
        onMouseEnter={() => {
          setMouseToCenter();
          onHoverChange(id, true);
        }}
        onMouseMove={(event) => {
          mouseX.set(event.clientX);
        }}
        onMouseLeave={() => onHoverChange(id, false)}
        aria-label={label}
        data-dock-id={id}
        onClick={() => onClick(id)}
      >
        <motion.div
          style={{
            scale: iconScale,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isLoading ? (
            <Loader2 size={15} className="spin" />
          ) : (
            children
          )}
        </motion.div>
      </motion.button>
    </div>
  );
});
