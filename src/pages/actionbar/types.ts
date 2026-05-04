import type { ReactNode } from "react";

export type WindowAnchor =
  | "center"
  | "bottom-left"
  | "top-left"
  | "point-to-surface-top-left"
  | "screen-point-to-surface-top-left"
  | "surface-top-left-to-point-center";

export interface Selection {
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

export interface CursorPosition {
  x: number;
  y: number;
}

export type TransformActionId = "translate" | "polish" | "grammar" | "explain" | "summarize";
export type ActionId = "ask" | TransformActionId;

export interface DockAction {
  id: TransformActionId;
  label: string;
  cn: string;
  shortcut: string;
  icon: ReactNode;
}

export interface AskAction {
  id: "ask";
  label: string;
  icon: ReactNode;
}

export type ResultTone = "neutral" | "success" | "warning" | "error";
export type ResultKind = "rewrite" | "answer" | "error" | "status";
export type SurfaceMode = "orb" | "dock";
