import { invoke } from "@tauri-apps/api/core";
import type { TransformActionId } from "./types";

export type TranslateMode = "auto" | "to_chinese" | "to_english";
export type PolishStyle = "balanced" | "concise" | "formal" | "friendly" | "professional" | "custom";

export interface AIConfig {
  apiKey: string;
  apiHost: string;
  model: string;
  translateMode: TranslateMode;
  polishStyle: PolishStyle;
  polishCustomInstruction: string;
}

function normalizeTranslateMode(value: string | null): TranslateMode {
  if (value === "to_chinese" || value === "to_english") {
    return value;
  }

  return "auto";
}

function normalizePolishStyle(value: string | null): PolishStyle {
  if (
    value === "concise" ||
    value === "formal" ||
    value === "friendly" ||
    value === "professional" ||
    value === "custom"
  ) {
    return value;
  }

  return "balanced";
}

export async function loadAIConfig(): Promise<AIConfig> {
  const apiKey = await invoke<string | null>("get_setting", {
    key: "kimi_api_key",
  });
  const apiHost = await invoke<string | null>("get_setting", {
    key: "kimi_api_host",
  });
  const model = await invoke<string | null>("get_setting", {
    key: "kimi_model",
  });
  const translateMode = await invoke<string | null>("get_setting", {
    key: "translate_mode",
  });
  const polishStyle = await invoke<string | null>("get_setting", {
    key: "polish_style",
  });
  const polishCustomInstruction = await invoke<string | null>("get_setting", {
    key: "polish_custom_instruction",
  });

  return {
    apiKey: (apiKey || "").trim(),
    apiHost: apiHost || "api.moonshot.cn",
    model: model || "moonshot-v1-8k",
    translateMode: normalizeTranslateMode(translateMode),
    polishStyle: normalizePolishStyle(polishStyle),
    polishCustomInstruction: (polishCustomInstruction || "").trim(),
  };
}

export async function transformSelectedText({
  text,
  action,
  config,
}: {
  text: string;
  action: TransformActionId;
  config: AIConfig;
}): Promise<string> {
  return invoke<string>("transform_text", {
    text,
    action,
    apiKey: config.apiKey,
    apiHost: config.apiHost,
    model: config.model,
    translateMode: config.translateMode,
    polishStyle: config.polishStyle,
    polishCustomInstruction: config.polishCustomInstruction,
  });
}

export async function askAboutSelectedText({
  text,
  question,
  config,
}: {
  text: string;
  question: string;
  config: AIConfig;
}): Promise<string> {
  return invoke<string>("custom_text_action", {
    text,
    mode: "ask",
    instruction: question,
    apiKey: config.apiKey,
    apiHost: config.apiHost,
    model: config.model,
  });
}
