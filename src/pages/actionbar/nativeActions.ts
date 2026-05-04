import { invoke } from "@tauri-apps/api/core";

export async function setActionbarBusy(busy: boolean) {
  await invoke("set_actionbar_busy", { busy });
}

export async function setActionbarInputMode(enabled: boolean) {
  await invoke("set_actionbar_input_mode", { enabled });
}

export async function openSettingsWindow() {
  await invoke("open_settings_window");
}

export async function replaceSelectionText({
  text,
  originalText,
  targetApp,
}: {
  text: string;
  originalText: string;
  targetApp: string | null;
}) {
  await invoke("replace_selection", {
    text,
    originalText,
    targetApp,
  });
}

export async function undoLastNativeReplace() {
  await invoke("undo_last_replace");
}
