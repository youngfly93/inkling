type MonoIconProps = {
  size?: number;
  strokeWidth?: number;
};

export function TranslateIcon({ size = 16, strokeWidth = 1.9 }: MonoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h9" />
      <path d="M8.5 3v2" />
      <path d="M11.5 5c-.7 4.1-2.8 7.1-6.5 9.2" />
      <path d="M6.5 8.6c1.1 2.1 2.6 3.7 4.6 4.7" />
      <path d="M14 19l3.5-8 3.5 8" />
      <path d="M15.2 16.2h4.6" />
    </svg>
  );
}

export function PolishIcon({ size = 16, strokeWidth = 1.9 }: MonoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l5.4-1.4L19.8 8.2a2.1 2.1 0 0 0 0-3L18.8 4.2a2.1 2.1 0 0 0-3 0L5.4 14.6 4 20z" />
      <path d="M14.7 5.3l4 4" />
      <path d="M13 20h7" />
    </svg>
  );
}

export function GrammarIcon({ size = 16, strokeWidth = 1.9 }: MonoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6h8" />
      <path d="M5 10h7" />
      <path d="M5 14h5" />
      <path d="M15 14.5l2.2 2.2L21 11.8" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function ExplainIcon({ size = 16, strokeWidth = 1.9 }: MonoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.6-1.3 2.1-2.1 2.8-.5.4-.7.8-.7 1.5" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

export function SummarizeIcon({ size = 16, strokeWidth = 1.9 }: MonoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5h14" />
      <path d="M5 9h11" />
      <path d="M5 13h8" />
      <path d="M5 17h6" />
      <path d="M16.5 15.5l2.5 2.5 2.5-2.5" />
      <path d="M19 11v7" />
    </svg>
  );
}

export function AskIcon() {
  return (
    <span
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: 17,
        fontStyle: "italic",
        lineHeight: 1,
      }}
    >
      i
    </span>
  );
}
