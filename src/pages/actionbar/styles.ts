import type React from "react";
import type { CSSProperties } from "react";

export function panelKickerStyle(): CSSProperties {
  return {
    color: "rgba(10,10,10,0.4)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

export function preventButtonFocus(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

export function panelGhostButtonStyle(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 26,
    padding: "0 9px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "rgba(10,10,10,0.7)",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
  };
}

export function panelPrimaryButtonStyle(background = "#0a0a0a"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 26,
    padding: "0 11px",
    borderRadius: 6,
    border: "none",
    background,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 650,
    cursor: "pointer",
    boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
  };
}

export function panelIconButtonStyle(): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "grid",
    placeItems: "center",
    border: "none",
    background: "transparent",
    color: "rgba(10,10,10,0.4)",
    fontSize: 17,
    lineHeight: 1,
    cursor: "pointer",
  };
}
