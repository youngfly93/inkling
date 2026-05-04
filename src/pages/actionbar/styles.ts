import type React from "react";
import type { CSSProperties } from "react";

type PanelBodyTone = "default" | "error";

export const ui = {
  color: {
    ink: "var(--ink-900)",
    inkStrong: "var(--ink-800)",
    inkReadable: "var(--ink-700)",
    inkMuted: "var(--ink-550)",
    inkSubtle: "var(--ink-450)",
    inkFaint: "var(--ink-400)",
    border: "var(--ink-border)",
    borderSoft: "var(--ink-border-soft)",
    borderFaint: "var(--ink-border-faint)",
    white: "#ffffff",
    surface: "var(--surface-plain)",
    surfaceRaised: "var(--surface-raised)",
    surfaceSubtle: "var(--surface-subtle)",
    error: "#b91c1c",
    errorText: "#991b1b",
  },
  radius: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 18,
    pill: 999,
  },
  font: {
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  shadow: {
    panel: "0 10px 24px rgba(0,0,0,0.1)",
    button: "0 1px 0 rgba(255,255,255,0.12) inset, 0 2px 6px rgba(0,0,0,0.18)",
  },
} as const;

export function panelSurfaceStyle(): CSSProperties {
  return {
    width: 360,
    maxWidth: "96vw",
    borderRadius: ui.radius.md,
    overflow: "hidden",
    background: ui.color.surfaceRaised,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: `1px solid ${ui.color.border}`,
    boxShadow: ui.shadow.panel,
  };
}

export function panelHeaderStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderBottom: `1px solid ${ui.color.borderFaint}`,
  };
}

export function panelIconBadgeStyle(background: string = ui.color.ink): CSSProperties {
  return {
    width: 22,
    height: 22,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: ui.radius.xs,
    background,
    color: ui.color.white,
  };
}

export function panelTitleStyle(): CSSProperties {
  return {
    color: ui.color.ink,
    fontSize: 12,
    fontWeight: ui.font.weight.semibold,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

export function panelCaptionStyle(): CSSProperties {
  return {
    marginTop: 1,
    color: ui.color.inkSubtle,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

export function panelKickerStyle(): CSSProperties {
  return {
    color: ui.color.inkFaint,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 9,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

export function panelSourceStyle(): CSSProperties {
  return {
    padding: "10px 12px 6px",
    borderBottom: `1px dashed ${ui.color.borderSoft}`,
  };
}

export function sourcePreviewStyle(): CSSProperties {
  return {
    marginTop: 6,
    color: ui.color.inkMuted,
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
    background: ui.color.surfaceSubtle,
    borderLeft: tone === "error" ? `2px solid ${ui.color.error}` : undefined,
  };
}

export function panelFooterStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    borderTop: `1px solid ${ui.color.borderFaint}`,
    background: ui.color.white,
  };
}

export function panelTextareaStyle(): CSSProperties {
  return {
    width: "100%",
    minHeight: 76,
    marginTop: 6,
    resize: "vertical",
    border: `1px solid ${ui.color.border}`,
    borderRadius: ui.radius.sm,
    outline: "none",
    padding: "9px 10px",
    boxSizing: "border-box",
    color: ui.color.ink,
    background: ui.color.white,
    fontFamily: "inherit",
    fontSize: 13,
    lineHeight: 1.45,
  };
}

export function panelStatusStyle(): CSSProperties {
  return {
    marginTop: 10,
    color: ui.color.inkSubtle,
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
    borderRadius: ui.radius.xs,
    border: "none",
    background: "transparent",
    color: ui.color.inkReadable,
    fontSize: 11,
    fontWeight: ui.font.weight.medium,
    cursor: "pointer",
  };
}

export function panelPrimaryButtonStyle(background: string = ui.color.ink): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 27,
    padding: "0 12px",
    borderRadius: ui.radius.sm,
    border: "none",
    background,
    color: ui.color.white,
    fontSize: 11,
    fontWeight: ui.font.weight.semibold,
    cursor: "pointer",
    boxShadow: ui.shadow.button,
  };
}

export function panelIconButtonStyle(): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: ui.radius.xs,
    display: "grid",
    placeItems: "center",
    border: "none",
    background: "transparent",
    color: ui.color.inkFaint,
    fontSize: 17,
    lineHeight: 1,
    cursor: "pointer",
  };
}
