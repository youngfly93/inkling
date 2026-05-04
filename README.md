# Inkling

macOS selection assistant for translation, rewriting, explanation, and lightweight collection.

- **Translate** / **Polish** / **Grammar** — AI-powered text transformation via Kimi
- **Explain** / **Summarize** / **Ask AI** — understand selected text without leaving the current app
- **Library** — collect selected text and generated results with source metadata
- Auto-popup floating action bar on text selection

## Stack

- Tauri v2 + React + TypeScript + Vite
- Rust backend, SQLite storage
- Swift native bridge for macOS text selection (Accessibility API)

## Build

```bash
pnpm install
CARGO_TARGET_DIR="$HOME/.cache/inkling_target" pnpm tauri build
```

## Dev

```bash
CARGO_TARGET_DIR="$HOME/.cache/inkling_target" pnpm tauri dev
```

Note: use `CARGO_TARGET_DIR` on external drives to avoid macOS `._*` file issues.
