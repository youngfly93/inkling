import type React from "react";
import type { CSSProperties } from "react";

type PanelBodyTone = "default" | "error";

export function panelSurfaceStyle(): CSSProperties {
  return {
    width: 360,
    maxWidth: "96vw",
    borderRadius: 12,
    overflow: "hidden",
    background: "rgba(255,255,255,0.98)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(10,10,10,0.09)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.1)",
  };
}

export function panelHeaderStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderBottom: "1px solid rgba(10,10,10,0.06)",
  };
}

export function panelIconBadgeStyle(background = "#0a0a0a"): CSSProperties {
  return {
    width: 22,
    height: 22,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    background,
    color: "#ffffff",
  };
}

export function panelTitleStyle(): CSSProperties {
  return {
    color: "#0a0a0a",
    fontSize: 12,
    fontWeight: 650,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

export function panelCaptionStyle(): CSSProperties {
  return {
    marginTop: 1,
    color: "rgba(10,10,10,0.45)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

export function panelKickerStyle(): CSSProperties {
  return {
    color: "rgba(10,10,10,0.4)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 9,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

export function panelSourceStyle(): CSSProperties {
  return {
    padding: "10px 12px 6px",
    borderBottom: "1px dashed rgba(10,10,10,0.08)",
  };
}

export function sourcePreviewStyle(): CSSProperties {
  return {
    marginTop: 4,
    color: "rgba(10,10,10,0.55)",
    fontSize: 12,
    lineHeight: 1.5,
    maxHeight: 36,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    whiteSpace: "pre-wrap",
  };
}

export function panelBodyStyle(tone: PanelBodyTone = "default"): CSSProperties {
  return {
    padding: "10px 12px 14px",
    background: tone === "error" ? "#fff7f7" : "#fafafa",
  };
}

export function panelFooterStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    borderTop: "1px solid rgba(10,10,10,0.06)",
    background: "#ffffff",
  };
}

export function panelTextareaStyle(): CSSProperties {
  return {
    width: "100%",
    minHeight: 76,
    marginTop: 6,
    resize: "vertical",
    border: "1px solid rgba(10,10,10,0.1)",
    borderRadius: 8,
    outline: "none",
    padding: "9px 10px",
    boxSizing: "border-box",
    color: "#0a0a0a",
    background: "#ffffff",
    fontFamily: "inherit",
    fontSize: 13,
    lineHeight: 1.45,
  };
}

export function panelStatusStyle(): CSSProperties {
  return {
    marginTop: 10,
    color: "rgba(10,10,10,0.48)",
    fontSize: 11,
    lineHeight: 1.45,
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
    height: 27,
    padding: "0 12px",
    borderRadius: 7,
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
