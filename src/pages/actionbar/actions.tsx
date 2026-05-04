import { AskIcon, ExplainIcon, GrammarIcon, PolishIcon, SummarizeIcon, TranslateIcon } from "./icons";
import type { ActionId, AskAction, DockAction, ResultKind } from "./types";

export const DOCK_ACTIONS: DockAction[] = [
  {
    id: "translate",
    label: "Translate",
    cn: "翻译",
    shortcut: "1",
    icon: <TranslateIcon size={16} />,
  },
  {
    id: "polish",
    label: "Polish",
    cn: "润色",
    shortcut: "2",
    icon: <PolishIcon size={16} />,
  },
  {
    id: "grammar",
    label: "Grammar",
    cn: "修语法",
    shortcut: "3",
    icon: <GrammarIcon size={16} />,
  },
  {
    id: "explain",
    label: "Explain",
    cn: "解释",
    shortcut: "4",
    icon: <ExplainIcon size={16} />,
  },
  {
    id: "summarize",
    label: "Summarize",
    cn: "总结",
    shortcut: "5",
    icon: <SummarizeIcon size={16} />,
  },
];

export const ASK_ACTION: AskAction = {
  id: "ask",
  label: "Ask AI",
  icon: <AskIcon />,
};

export function actionLabel(actionId: ActionId | string): string {
  switch (actionId) {
    case "ask":
      return "Ask AI";
    case "translate":
      return "Translate";
    case "polish":
      return "Polish";
    case "grammar":
      return "Grammar";
    case "explain":
      return "Explain";
    case "summarize":
      return "Summarize";
    default:
      return actionId;
  }
}

export function canReplaceAction(actionId: ActionId, editable: boolean): boolean {
  return editable && (actionId === "translate" || actionId === "polish" || actionId === "grammar");
}

export function actionResultKind(actionId: ActionId): ResultKind {
  return actionId === "ask" || actionId === "explain" || actionId === "summarize" ? "answer" : "rewrite";
}

export function actionStatus(actionId: ActionId, editable: boolean, sourceName: string): string {
  if (actionId === "ask") {
    return "Answer based on the selected text and your question.";
  }

  if (!canReplaceAction(actionId, editable)) {
    return actionId === "explain" || actionId === "summarize"
      ? "This reading result is copy-only, so Replace stays hidden."
      : `${sourceName} is read-only here. Copy is available, but Replace stays hidden.`;
  }

  return `${sourceName} is editable here. Press Enter or click Replace to write back.`;
}

export function wordTransitionLabel(input: string, output: string): string {
  const inCount = input.split(/\s+/).filter(Boolean).length;
  const outCount = output.split(/\s+/).filter(Boolean).length;
  const inUnit = inCount === 1 ? "word" : "words";
  const outUnit = outCount === 1 ? "word" : "words";
  return `${inCount} ${inUnit} -> ${outCount} ${outUnit}`;
}

export function describeTransformError(message: string): {
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

export function describeReplaceError(message: string, sourceName: string): {
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
      title: "Inkling couldn’t find a live selection",
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
