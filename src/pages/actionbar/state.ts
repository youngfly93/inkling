import type { ActionId, ResultKind, ResultTone } from "./types";

export interface PanelState {
  loading: string | null;
  result: string | null;
  resultTitle: string | null;
  resultTone: ResultTone;
  showSettingsCta: boolean;
  copied: boolean;
  replaceApplied: boolean;
  statusMessage: string | null;
  resultCanReplace: boolean;
  resultKind: ResultKind;
  resultActionId: ActionId | null;
  askPanelOpen: boolean;
  askQuestion: string;
}

export const initialPanelState: PanelState = {
  loading: null,
  result: null,
  resultTitle: null,
  resultTone: "neutral",
  showSettingsCta: false,
  copied: false,
  replaceApplied: false,
  statusMessage: null,
  resultCanReplace: false,
  resultKind: "rewrite",
  resultActionId: null,
  askPanelOpen: false,
  askQuestion: "",
};

export type RevealPanelPayload = {
  title: string;
  body: string;
  tone?: ResultTone;
  status?: string | null;
  showSettings?: boolean;
  height?: number;
  canReplace?: boolean;
  kind?: ResultKind;
  actionId?: ActionId | null;
};

export type PanelAction =
  | { type: "selectionReady" }
  | { type: "resetInlinePanels" }
  | { type: "revealPanel"; payload: RevealPanelPayload }
  | { type: "openAskPanel" }
  | { type: "setAskQuestion"; question: string }
  | { type: "beginTransform"; loading: string }
  | { type: "setLoading"; loading: string | null }
  | { type: "setCopied"; copied: boolean }
  | { type: "replaceSuccess" }
  | { type: "replaceError"; title: string; detail: string; status: string }
  | { type: "undoSuccess" }
  | { type: "markReplaceNotApplied" };

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "selectionReady":
      return initialPanelState;

    case "resetInlinePanels":
      return {
        ...state,
        result: null,
        resultTitle: null,
        resultTone: "neutral",
        showSettingsCta: false,
        statusMessage: null,
        replaceApplied: false,
        resultCanReplace: false,
        resultKind: "rewrite",
        resultActionId: null,
        askPanelOpen: false,
        askQuestion: "",
      };

    case "revealPanel":
      return {
        ...state,
        askPanelOpen: false,
        resultTitle: action.payload.title,
        result: action.payload.body,
        resultTone: action.payload.tone ?? "neutral",
        statusMessage: action.payload.status ?? null,
        showSettingsCta: action.payload.showSettings ?? false,
        resultCanReplace: action.payload.canReplace ?? false,
        resultKind: action.payload.kind ?? "rewrite",
        resultActionId: action.payload.actionId ?? null,
      };

    case "openAskPanel":
      return {
        ...state,
        result: null,
        resultTitle: null,
        resultTone: "neutral",
        statusMessage: null,
        showSettingsCta: false,
        resultCanReplace: false,
        resultKind: "answer",
        resultActionId: "ask",
        askPanelOpen: true,
        copied: false,
        replaceApplied: false,
      };

    case "setAskQuestion":
      return {
        ...state,
        askQuestion: action.question,
      };

    case "beginTransform":
      return {
        ...state,
        loading: action.loading,
        copied: false,
        replaceApplied: false,
        statusMessage: null,
      };

    case "setLoading":
      return {
        ...state,
        loading: action.loading,
      };

    case "setCopied":
      return {
        ...state,
        copied: action.copied,
      };

    case "replaceSuccess":
      return {
        ...state,
        replaceApplied: true,
        resultTitle: "Replaced in place",
        resultTone: "success",
        resultKind: "status",
        statusMessage: "Cmd/Ctrl+Z or Undo can restore the last replace in supported editors.",
        showSettingsCta: false,
      };

    case "replaceError":
      return {
        ...state,
        resultTitle: action.title,
        result: action.detail,
        resultTone: "error",
        resultKind: "error",
        statusMessage: action.status,
        showSettingsCta: false,
        replaceApplied: false,
      };

    case "undoSuccess":
      return {
        ...state,
        replaceApplied: false,
        resultTitle: "Undo applied",
        resultTone: "success",
        statusMessage: "Original text restored.",
      };

    case "markReplaceNotApplied":
      return {
        ...state,
        replaceApplied: false,
      };

    default:
      return state;
  }
}
