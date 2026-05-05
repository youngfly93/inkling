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

## App Identity

- Product name: `Inkling`
- Bundle identifier: `com.youngfly93.inkling`
- Local database: `inkling.db`

On first launch after the identity change, Inkling copies existing settings and library data from the legacy `com.seleany.pro` app directory if the new app directory is still empty.

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
