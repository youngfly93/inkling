import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Selection } from "./types";

export function getSourceName(selection: Selection): string {
  if (selection.appName?.trim()) {
    return selection.appName;
  }

  if (selection.app?.trim()) {
    const parts = selection.app.split(".");
    return parts[parts.length - 1] || selection.app;
  }

  return "Current app";
}

export async function getElementScreenCenter(element: HTMLElement | null): Promise<{ x: number; y: number } | null> {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const win = getCurrentWindow();
  const [outerPos, scaleFactor] = await Promise.all([
    win.outerPosition(),
    win.scaleFactor(),
  ]);

  return {
    x: outerPos.x + (rect.left + rect.width / 2) * scaleFactor,
    y: outerPos.y + (rect.top + rect.height / 2) * scaleFactor,
  };
}
