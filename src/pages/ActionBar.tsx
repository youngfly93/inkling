import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { motion } from "motion/react";
import {
  DOCK_WINDOW_HEIGHT,
  DOCK_WINDOW_WIDTH,
  ORB_WINDOW_HEIGHT,
  ORB_WINDOW_WIDTH,
  SURFACE_PADDING_BOTTOM,
  SURFACE_PADDING_TOP,
  SURFACE_PADDING_X,
} from "./actionbar/constants";
import { AskPanel } from "./actionbar/AskPanel";
import { DockIcon } from "./actionbar/DockIcon";
import { ResultPanel } from "./actionbar/ResultPanel";
import { AskIcon } from "./actionbar/icons";
import { getElementScreenCenter, getSourceName } from "./actionbar/selection";
import { useActionbarWindow } from "./actionbar/useActionbarWindow";
import { useDockHover } from "./actionbar/useDockHover";
import { useActionbarActions } from "./actionbar/useActionbarActions";
import { initialPanelState, panelReducer } from "./actionbar/state";
import {
  ASK_ACTION,
  DOCK_ACTIONS,
  wordTransitionLabel,
} from "./actionbar/actions";
import {
  preventButtonFocus,
} from "./actionbar/styles";
import type {
  Selection,
  SurfaceMode,
} from "./actionbar/types";

export default function ActionBar() {
  const [sel, setSel] = useState<Selection>({ text: "", app: "", url: "", editable: false });
  const [panel, dispatchPanel] = useReducer(panelReducer, initialPanelState);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("orb");
  const [orbHovered, setOrbHovered] = useState(false);
  const orbRef = useRef<HTMLButtonElement | null>(null);
  const askInputRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    loading,
    result,
    resultTitle,
    resultTone,
    showSettingsCta,
    copied,
    replaceApplied,
    statusMessage,
    resultCanReplace,
    resultActionId,
    askPanelOpen,
    askQuestion,
  } = panel;
  const text = sel.text;
  const sourceName = getSourceName(sel);
  const hasResult = !!result;
  const isErrorResult = !!result && resultTone === "error";
  const {
    contentRef,
    resizeActionBarWindow,
  } = useActionbarWindow({
    surfaceMode,
    hasResult,
    askPanelOpen,
    resultTitle,
    resultTone,
    statusMessage,
    showSettingsCta,
    replaceApplied,
    loading,
  });
  const {
    dockRef,
    hoveredAction,
    setHoveredAction,
    setDockItemRef,
    clearDockHover,
    syncDockHoverFromClientPoint,
    syncDockHoverFromSelection,
  } = useDockHover({ surfaceMode, hasResult, askPanelOpen });
  const {
    runAI,
    copyText,
    replaceResult,
    undoLastReplace,
    openSettings,
    openAskPanel,
    submitAsk,
  } = useActionbarActions({
    selection: sel,
    sourceName,
    loading,
    result,
    askQuestion,
    dispatchPanel,
    resizeActionBarWindow,
    setSurfaceMode,
    setOrbHovered,
    clearDockHover,
    askInputRef,
  });

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
      dispatchPanel({ type: "selectionReady" });
      setHoveredAction(null);
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
  }, [clearDockHover, resizeActionBarWindow, setHoveredAction]);

  useEffect(() => {
    if (surfaceMode !== "orb" || orbHovered || loading || result || askPanelOpen || !sel.text.trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void getCurrentWindow().hide();
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [surfaceMode, orbHovered, loading, result, askPanelOpen, sel.text]);

  function resetInlinePanels() {
    dispatchPanel({ type: "resetInlinePanels" });
  }

  async function expandDock() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    await invoke("set_actionbar_input_mode", { enabled: false }).catch(() => {});
    const anchorPoint = await getElementScreenCenter(orbRef.current);
    setSurfaceMode("dock");
    setOrbHovered(false);
    await resizeActionBarWindow(DOCK_WINDOW_WIDTH, DOCK_WINDOW_HEIGHT, {
      anchor: anchorPoint ? "screen-point-to-surface-top-left" : "point-to-surface-top-left",
      screenPoint: anchorPoint,
    });
    await getCurrentWindow().show();
    await syncDockHoverFromSelection(sel);
  }

  async function collapseToOrb() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    await invoke("set_actionbar_input_mode", { enabled: false }).catch(() => {});
    resetInlinePanels();
    clearDockHover();
    setOrbHovered(false);
    setSurfaceMode("orb");
    await resizeActionBarWindow(ORB_WINDOW_WIDTH, ORB_WINDOW_HEIGHT, { anchor: "surface-top-left-to-point-center" });
    await getCurrentWindow().show();
  }

  useEffect(() => {
    const onBlur = () => {
      setHoveredAction(null);
      setOrbHovered(false);
      (document.activeElement as HTMLElement | null)?.blur?.();
      void invoke("dismiss_action_bar");
    };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;

      if (isTextInput) {
        if (key === "escape") {
          e.preventDefault();
          void collapseToOrb();
        }
        return;
      }

      if (key === "escape") {
        e.preventDefault();
        if (result || askPanelOpen || surfaceMode === "dock") {
          void collapseToOrb();
        } else {
          void getCurrentWindow().hide();
        }
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
        case "a":
        case "A":
          e.preventDefault();
          void openAskPanel();
          break;
        case "1":
          e.preventDefault();
          void runAI("translate");
          break;
        case "2":
          e.preventDefault();
          void runAI("polish");
          break;
        case "3":
          e.preventDefault();
          void runAI("grammar");
          break;
        case "4":
          e.preventDefault();
          void runAI("explain");
          break;
        case "5":
          e.preventDefault();
          void runAI("summarize");
          break;
        default:
          e.preventDefault();
          break;
      }
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, [askPanelOpen, isErrorResult, loading, replaceApplied, result, resultCanReplace, surfaceMode]);

  // Stable dispatchers so DockIcon (React.memo) never re-renders from callback
  // identity churn. The actual handlers live in a ref so we can call the latest
  // closure without tracking every dependency.
  const actionHandlersRef = useRef<Record<string, () => void>>({});
  actionHandlersRef.current = {
    ask: () => {
      void openAskPanel();
    },
    translate: () => runAI("translate"),
    polish: () => runAI("polish"),
    grammar: () => runAI("grammar"),
    explain: () => runAI("explain"),
    summarize: () => runAI("summarize"),
  };

  const handleActionClick = useCallback((id: string) => {
    actionHandlersRef.current[id]?.();
  }, []);

  const handleActionHover = useCallback((id: string, next: boolean) => {
    setHoveredAction(next ? id : null);
  }, []);

  const activeAction = resultActionId
    ? resultActionId === "ask"
      ? ASK_ACTION
      : DOCK_ACTIONS.find((action) => action.id === resultActionId) ?? null
    : null;
  const resultStats = result
    ? resultActionId === "ask"
      ? "answer"
      : wordTransitionLabel(text, result)
    : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: surfaceMode === "orb" && !result ? "center" : "flex-start",
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
          justifyContent: surfaceMode === "orb" && !result ? "center" : "flex-start",
          gap: 8,
          width: surfaceMode === "orb" && !result ? ORB_WINDOW_WIDTH : "fit-content",
          height: surfaceMode === "orb" && !result ? ORB_WINDOW_HEIGHT : undefined,
          maxWidth: "100%",
          padding:
            surfaceMode === "orb" && !result
              ? "0"
              : `${SURFACE_PADDING_TOP}px ${SURFACE_PADDING_X}px ${SURFACE_PADDING_BOTTOM}px`,
          boxSizing: "border-box",
          background: "transparent",
          overflow: "visible",
      }}
    >
      {!result && !askPanelOpen && surfaceMode === "orb" ? (
        <motion.button
          ref={orbRef}
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
          onMouseDown={preventButtonFocus}
          style={{
            position: "relative",
            width: 10,
            height: 10,
            borderRadius: 999,
            border: "none",
            background: "#0a0a0a",
            boxShadow: orbHovered
              ? "0 4px 10px rgba(0,0,0,0.22)"
              : "0 3px 8px rgba(0,0,0,0.18)",
            cursor: "pointer",
            padding: 0,
            display: "grid",
            placeItems: "center",
            willChange: "transform",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
        />
      ) : !result && !askPanelOpen ? (
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
            gap: 5,
            padding: "7px",
            borderRadius: 18,
            background: "#ffffff",
            border: "1px solid rgba(10,10,10,0.1)",
            boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
            willChange: "transform",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
        >
          <DockIcon
            id="ask"
            label="Ask AI"
            cn="询问"
            shortcut="A"
            hovered={hoveredAction === "ask"}
            isLoading={loading === "ask"}
            onHoverChange={handleActionHover}
            setButtonRef={setDockItemRef}
            onClick={handleActionClick}
          >
            <AskIcon />
          </DockIcon>
          <div
            aria-hidden="true"
            style={{
              alignSelf: "center",
              width: 1,
              height: 18,
              background: "rgba(10,10,10,0.1)",
              marginRight: 1,
            }}
          />
          {DOCK_ACTIONS.map((a) => (
            <DockIcon
              key={a.id}
              id={a.id}
              label={a.label}
              cn={a.cn}
              shortcut={a.shortcut}
              hovered={hoveredAction === a.id}
              isLoading={loading === a.id}
              onHoverChange={handleActionHover}
              setButtonRef={setDockItemRef}
              onClick={handleActionClick}
            >
              {a.icon}
            </DockIcon>
          ))}
        </motion.div>
      ) : null}

      {askPanelOpen && !result && (
        <AskPanel
          inputRef={askInputRef}
          question={askQuestion}
          loading={loading}
          sourceName={sourceName}
          selectedText={text}
          onQuestionChange={(question) => {
            dispatchPanel({ type: "setAskQuestion", question });
          }}
          onClose={() => {
            void collapseToOrb();
          }}
          onSubmit={() => {
            void submitAsk();
          }}
        />
      )}

      {result && (
        <ResultPanel
          result={result}
          resultTone={resultTone}
          isErrorResult={isErrorResult}
          activeAction={activeAction}
          resultTitle={resultTitle}
          resultStats={resultStats}
          sourceName={sourceName}
          selectedText={text}
          statusMessage={statusMessage}
          resultActionId={resultActionId}
          showSettingsCta={showSettingsCta}
          copied={copied}
          replaceApplied={replaceApplied}
          resultCanReplace={resultCanReplace}
          loading={loading}
          onClose={() => {
            void collapseToOrb();
          }}
          onRetry={() => {
            if (resultActionId === "ask") {
              void submitAsk();
            } else if (resultActionId) {
              void runAI(resultActionId);
            }
          }}
          onOpenSettings={() => {
            void openSettings();
          }}
          onCopy={copyText}
          onUndo={() => {
            void undoLastReplace();
          }}
          onReplace={() => {
            void replaceResult();
          }}
        />
      )}

      </div>
    </div>
  );
}
