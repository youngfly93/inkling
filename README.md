# Seleany Pro

macOS text refinement & sentence collection tool.

- **To English** / **To Chinese** / **Expand** — AI-powered text transformation via Kimi
- **Save Sentence** — collect text with source metadata into a searchable library
- Auto-popup floating action bar on text selection

## Stack

- Tauri v2 + React + TypeScript + Vite
- Rust backend, SQLite storage
- Swift native bridge for macOS text selection (Accessibility API)

## Build

```bash
pnpm install
CARGO_TARGET_DIR="$HOME/.cache/seleany_pro_target" pnpm tauri build
```

## Dev

```bash
CARGO_TARGET_DIR="$HOME/.cache/seleany_pro_target" pnpm tauri dev
```

Note: use `CARGO_TARGET_DIR` on external drives to avoid macOS `._*` file issues.
