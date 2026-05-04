import { invoke } from "@tauri-apps/api/core";
import type { TransformActionId } from "./types";

export interface AIConfig {
  apiKey: string;
  apiHost: string;
  model: string;
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

  return {
    apiKey: (apiKey || "").trim(),
    apiHost: apiHost || "api.moonshot.cn",
    model: model || "moonshot-v1-8k",
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
