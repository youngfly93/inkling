import type { Dispatch, RefObject, SetStateAction } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  actionLabel,
  actionResultKind,
  actionStatus,
  canReplaceAction,
  describeReplaceError,
  describeTransformError,
} from "./actions";
import { askAboutSelectedText, loadAIConfig, transformSelectedText } from "./aiClient";
import { PANEL_WINDOW_WIDTH } from "./constants";
import { saveTransformResultBestEffort } from "./libraryPersistence";
import {
  openSettingsWindow,
  replaceSelectionText,
  setActionbarBusy,
  setActionbarInputMode,
  undoLastNativeReplace,
} from "./nativeActions";
import type { ResizeActionBarWindow } from "./useActionbarWindow";
import type { PanelAction, RevealPanelPayload } from "./state";
import type { Selection, SurfaceMode, TransformActionId } from "./types";

interface UseActionbarActionsOptions {
  selection: Selection;
  sourceName: string;
  loading: string | null;
  result: string | null;
  askQuestion: string;
  dispatchPanel: Dispatch<PanelAction>;
  resizeActionBarWindow: ResizeActionBarWindow;
  setSurfaceMode: Dispatch<SetStateAction<SurfaceMode>>;
  setOrbHovered: Dispatch<SetStateAction<boolean>>;
  clearDockHover: () => void;
  askInputRef: RefObject<HTMLTextAreaElement | null>;
}

export function useActionbarActions({
  selection,
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
}: UseActionbarActionsOptions) {
  const text = selection.text;
  const app = selection.app;
  const url = selection.url;

  async function revealPanel(payload: RevealPanelPayload) {
    (document.activeElement as HTMLElement | null)?.blur?.();
    await setActionbarInputMode(false).catch(() => {});
    setSurfaceMode("dock");
    setOrbHovered(false);
    dispatchPanel({ type: "revealPanel", payload });
    await resizeActionBarWindow(PANEL_WINDOW_WIDTH, payload.height ?? 340, { anchor: "top-left" });
    await getCurrentWindow().show();
  }

  async function runAI(actionId: TransformActionId) {
    dispatchPanel({ type: "beginTransform", loading: actionId });
    await setActionbarBusy(true);
    try {
      const config = await loadAIConfig();

      if (!config.apiKey) {
        await revealPanel({
          title: "Kimi API key is missing",
          body: "Open Settings from the menu bar and add your Kimi key before running Inkling actions.",
          tone: "error",
          status: "AI actions stay unavailable until the key is configured.",
          showSettings: true,
          height: 300,
          kind: "error",
          actionId,
        });
        return;
      }

      const output = await transformSelectedText({
        text,
        action: actionId,
        config,
      });

      await saveTransformResultBestEffort({
        text,
        app: app || null,
        url: url || null,
        type: actionId,
        inputText: text,
        outputText: output,
        model: config.model,
      });

      await revealPanel({
        title: `${actionLabel(actionId)} ready`,
        body: output,
        tone: "neutral",
        status: actionStatus(actionId, selection.editable, sourceName),
        height: 360,
        canReplace: canReplaceAction(actionId, selection.editable),
        kind: actionResultKind(actionId),
        actionId,
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
        actionId,
      });
      dispatchPanel({ type: "markReplaceNotApplied" });
    } finally {
      dispatchPanel({ type: "setLoading", loading: null });
      await setActionbarBusy(false);
    }
  }

  function copyText() {
    void setActionbarBusy(false);
    navigator.clipboard.writeText(result || text);
    dispatchPanel({ type: "setCopied", copied: true });
    setTimeout(() => dispatchPanel({ type: "setCopied", copied: false }), 1200);
  }

  async function replaceResult() {
    if (!result) {
      return;
    }

    dispatchPanel({ type: "setLoading", loading: "replace" });
    await setActionbarBusy(true);
    try {
      await replaceSelectionText({
        text: result,
        originalText: text,
        targetApp: app || null,
      });
      dispatchPanel({ type: "replaceSuccess" });
      await getCurrentWindow().show();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Replace error:", e);
      const friendly = describeReplaceError(message, sourceName);
      dispatchPanel({
        type: "replaceError",
        title: friendly.title,
        detail: friendly.detail,
        status: friendly.status,
      });
      await resizeActionBarWindow(PANEL_WINDOW_WIDTH, 348, { anchor: "top-left" });
    } finally {
      dispatchPanel({ type: "setLoading", loading: null });
      await setActionbarBusy(false);
    }
  }

  async function undoLastReplace() {
    dispatchPanel({ type: "setLoading", loading: "undo" });
    await setActionbarBusy(true);
    try {
      await undoLastNativeReplace();
      dispatchPanel({ type: "undoSuccess" });
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
      dispatchPanel({ type: "setLoading", loading: null });
      await setActionbarBusy(false);
    }
  }

  async function openSettings() {
    await openSettingsWindow();
    await getCurrentWindow().hide();
  }

  async function openAskPanel() {
    const win = getCurrentWindow();
    setSurfaceMode("dock");
    setOrbHovered(false);
    dispatchPanel({ type: "openAskPanel" });
    clearDockHover();
    await resizeActionBarWindow(PANEL_WINDOW_WIDTH, 318, { anchor: "top-left" });
    await win.show();
    await setActionbarInputMode(true);
    window.requestAnimationFrame(() => {
      askInputRef.current?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => {
        askInputRef.current?.focus({ preventScroll: true });
      });
    });
  }

  async function submitAsk() {
    const question = askQuestion.trim();
    if (!question || loading) {
      askInputRef.current?.focus();
      return;
    }

    dispatchPanel({ type: "beginTransform", loading: "ask" });
    await setActionbarBusy(true);
    try {
      const config = await loadAIConfig();

      if (!config.apiKey) {
        await revealPanel({
          title: "Kimi API key is missing",
          body: "Open Settings from the menu bar and add your Kimi key before asking Inkling.",
          tone: "error",
          status: "Ask AI stays unavailable until the key is configured.",
          showSettings: true,
          height: 300,
          kind: "error",
          actionId: "ask",
        });
        return;
      }

      const output = await askAboutSelectedText({
        text,
        question,
        config,
      });

      await saveTransformResultBestEffort({
        text,
        app: app || null,
        url: url || null,
        type: "ask",
        inputText: `${text}\n\nQ: ${question}`,
        outputText: output,
        model: config.model,
      });

      await revealPanel({
        title: "Ask AI answered",
        body: output,
        tone: "neutral",
        status: "Answer based on the selected text and your question.",
        height: 380,
        canReplace: false,
        kind: "answer",
        actionId: "ask",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Ask AI error:", e);
      const friendly = describeTransformError(message);
      await revealPanel({
        title: friendly.title,
        body: friendly.detail,
        tone: "error",
        status: friendly.status,
        showSettings: friendly.showSettingsCta,
        height: 320,
        kind: "error",
        actionId: "ask",
      });
    } finally {
      dispatchPanel({ type: "setLoading", loading: null });
      await setActionbarBusy(false);
    }
  }

  return {
    runAI,
    copyText,
    replaceResult,
    undoLastReplace,
    openSettings,
    openAskPanel,
    submitAsk,
  };
}
