# Inkling Tauri v2 Clean-Room Plan

Last updated: 2026-04-06

## 1. Goal

Build a new macOS app from scratch with:

- Tauri v2
- React + TypeScript + Vite
- Rust backend
- SQLite for sentence storage
- A minimal macOS-native bridge only where Tauri/Rust alone is not enough

Phase 1 product scope stays intentionally narrow:

1. `To English`
2. `Expand`
3. `Save Sentence`

Primary UX:

- User selects text in any macOS app.
- Inkling shows a tiny floating action bar near the selection.
- AI actions open a result window first, then let the user replace/insert/copy.
- `Save Sentence` stores the original text plus source metadata in a searchable library.

## 2. Why This Rewrite

This rewrite is justified if the real target is:

- a cleaner commercial codebase
- faster UI iteration
- simpler local state management
- a future beyond GPL inheritance

This rewrite is **not** justified by assumptions that Tauri removes macOS platform constraints. It does not.

Known platform facts from current Tauri docs:

- Tauri desktop development on macOS still requires Xcode or at least Xcode Command Line Tools.
- Direct-download macOS distribution still needs code signing.
- Direct-download distribution outside the App Store still needs notarization.

So the reason to move is code ownership and product velocity, not "zero native complexity."

## 3. Clean-Room Rules

This project must be implemented as a clean-room rewrite.

Allowed inputs:

- product requirements
- manual black-box behavior testing
- official Apple and Tauri documentation
- fresh architecture and naming decisions written in this repo

Not allowed:

- copying code from the old Selected/Seleany Swift repo
- porting file structure one-to-one
- reusing legacy config formats, action identifiers, or extension package formats
- line-by-line translation of old prompts, models, menus, or storage schemas

Practical implementation rule:

- Treat the old repo as a product specimen, not as source material.
- If a behavior is needed, restate it in this repo first as a requirement or acceptance test, then implement from that requirement.

## 4. Architecture Decision

### 4.1 Main stack

- Shell: Tauri v2
- Frontend: React + TypeScript + Vite
- Backend: Rust
- Local database: SQLite via `tauri-plugin-sql`
- Settings storage: `tauri-plugin-store`
- Global shortcut fallback: `tauri-plugin-global-shortcut`
- Tray/menu bar entry: Tauri tray APIs

### 4.2 Native bridge strategy

We should not build the whole app in Swift again.

But we should also not pretend macOS-native text selection access is "just web + Rust".

Planned bridge approach:

- Default plan: keep the app itself as Tauri/Rust/React.
- Add a **small macOS-native bridge module** for:
  - Accessibility trust check
  - current selection lookup
  - focused element editability check
  - browser-specific Apple Events / AppleScript access if needed
  - simulated copy fallback if needed

Implementation note:

- First pass may use a tiny Objective-C or Swift helper module if that is the shortest path to a stable bridge.
- Long-term, the bridge can be reduced or replaced with Rust + Apple bindings if the Rust route proves stable enough.

This keeps Swift as a small implementation detail instead of the app framework.

### 4.3 Minimum macOS version

Set minimum macOS to `13.0`.

Reasons:

- matches the original product target
- reduces compatibility surface
- keeps QA smaller
- avoids wasting time on legacy macOS behaviors that are not important for this product

Tauri supports configuring a custom minimum system version in `tauri.conf.json`, so we should explicitly set it rather than rely on the default.

### 4.4 Distribution target

Phase 1 distribution target:

- direct-download notarized `.dmg`

Phase 1 non-goals:

- Mac App Store
- sandboxed distribution

Reason:

- Accessibility + browser automation + simulated copy fallbacks are already enough complexity
- App Store constraints are not needed for the first usable product

## 5. Fresh Product Model

We are not rebuilding a general text toolbox.

We are building a narrow product:

- menu bar resident
- text-selection triggered
- 3 core actions only
- one compact library window

Fresh naming:

- app name: `Inkling`
- internal namespace prefix: `inkling`
- avoid legacy action ids and config names

Fresh data model:

### `saved_sentences`

- `id` TEXT PRIMARY KEY
- `original_text` TEXT NOT NULL
- `source_app` TEXT
- `source_url` TEXT
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `is_favorite` INTEGER NOT NULL DEFAULT 0
- `note` TEXT
- `text_hash` TEXT NOT NULL UNIQUE

### `sentence_transforms`

- `id` TEXT PRIMARY KEY
- `sentence_id` TEXT NOT NULL
- `transform_type` TEXT NOT NULL
- `input_text` TEXT NOT NULL
- `output_text` TEXT NOT NULL
- `model_name` TEXT
- `prompt_version` TEXT
- `created_at` TEXT NOT NULL

## 6. UX Modes

We should de-risk the app by shipping two invocation modes in order:

### Mode A: manual invoke

- global shortcut grabs current selection
- if selection is unavailable, optionally use clipboard fallback
- opens the action bar or result window

Why first:

- easiest path to end-to-end AI and storage validation
- gives us a working product even if auto-popup lags behind

### Mode B: auto-popup on selection

- detect mouse-based selection
- detect double-click word / triple-click line
- detect keyboard selection flows such as `Cmd+A` and `Cmd+Shift+Arrow`
- debounce before showing pop bar

This is the higher-risk part and should come after Mode A works.

## 7. System Modules

## 7.1 Frontend

`src/`

- `app/`
  - routing and app bootstrap
- `components/`
  - `PopBar`
  - `ResultPanel`
  - `SentenceLibrary`
  - `Settings`
- `state/`
  - app state
  - settings state
  - current selection/result state
- `services/`
  - Tauri command wrappers
  - SQL/store access adapters
- `styles/`
  - design tokens
  - animation tokens

Frontend principles:

- no generic admin UI look
- minimal chrome
- very fast open/close
- keyboard-first for result actions

## 7.2 Rust backend

`src-tauri/src/`

- `main.rs`
- `lib.rs`
- `commands/`
  - `selection.rs`
  - `windowing.rs`
  - `ai.rs`
  - `library.rs`
  - `settings.rs`
- `state/`
  - app state
  - db handles
  - bridge handles
- `db/`
  - migrations
  - query helpers
- `models/`
  - DTOs and command payloads
- `native/`
  - bridge entrypoints and macOS-specific glue

## 7.3 Native bridge

`src-tauri/native/selection-bridge/`

Responsibilities:

- accessibility permission check
- focused app metadata
- selected text retrieval
- editable target detection
- optional browser URL retrieval
- optional simulated copy fallback

Hard rule:

- the bridge returns structured facts only
- UI decisions stay in Rust/React

## 8. Fresh Selection Pipeline

The selection pipeline should be rebuilt from behavior requirements, not copied implementation.

Planned order:

1. Determine the frontmost app and focused element.
2. Ask the native bridge for structured selection data.
3. Try primary selection extraction:
   - Accessibility selected text
   - browser adapter if the active app is a supported browser
4. If empty and the app is on an explicit fallback allowlist:
   - perform temporary copy simulation
   - restore clipboard
5. Normalize into a fresh `SelectionSnapshot` DTO:
   - `text`
   - `sourceApp`
   - `sourceUrl`
   - `editable`
   - `captureMethod`
   - `capturedAt`

Do not ship a giant fallback matrix on day 1.

Phase 1 supported apps:

- TextEdit
- Notes
- Safari
- Chrome
- Arc
- VS Code

Everything else stays best-effort until verified.

## 9. AI Layer

Phase 1 provider choice:

- Kimi only

Reason:

- one provider is enough for the first product loop
- fewer settings
- fewer network branches

Planned backend shape:

- `ai.rs` owns all remote AI calls
- frontend never talks to Kimi directly
- API key stays in local settings storage
- result metadata is persisted with each transform

Phase 1 actions:

### `To English`

Intent:

- natural, polished English
- preserve meaning
- no fabricated facts
- output only rewritten text

### `Expand`

Intent:

- fuller and clearer wording
- preserve intent and tone
- no fabricated facts
- output only rewritten text

Prompt handling rule:

- prompts are versioned internally as plain constants
- no legacy prompt copy

## 10. Windowing Plan

We need three window types:

1. tray/menu window
2. floating action bar
3. result/library/settings windows

Window rules:

- action bar is tiny, border-light, always-on-top while active
- result window opens near the selection when possible
- result window must support:
  - copy
  - replace selection
  - insert before
  - insert after
  - save sentence

Tauri note:

- tray support is native in Tauri v2
- window configuration and native metadata can be customized through `tauri.conf.json`, `Info.plist`, and optional bundle files

## 11. Settings Model

Use `tauri-plugin-store` for small user settings only.

Phase 1 settings:

- Kimi API key
- Kimi base URL
- Kimi model
- launch at login
- manual shortcut
- enable auto-popup
- supported browser adapters
- copy fallback allowlist

Do not build:

- multi-provider settings
- prompt editor
- extension marketplace
- per-app action ordering UI

## 12. Phase Plan

## Phase 0: bootstrap

Deliverables:

- repo initialized
- Tauri v2 app scaffolded
- React + TypeScript + Vite running
- Rust, Node, and macOS toolchain verified
- clean-room docs committed

Acceptance:

- `pnpm tauri dev` launches a tray-capable desktop shell on macOS

## Phase 1: shell and settings

Deliverables:

- tray icon
- settings window
- store-backed configuration
- secure API key input
- launch-at-login toggle placeholder

Acceptance:

- settings persist across restarts

## Phase 2: manual selection path

Deliverables:

- global shortcut registration
- native bridge returns `SelectionSnapshot`
- result panel can open on demand

Acceptance:

- in TextEdit and Notes, manual invoke can fetch current selection reliably

## Phase 3: AI actions

Deliverables:

- Kimi integration
- `To English`
- `Expand`
- loading/error states

Acceptance:

- selected text can be rewritten and shown in the result panel

## Phase 4: save and library

Deliverables:

- SQLite schema and migrations
- save sentence action
- sentence library window
- search / copy / delete / favorite

Acceptance:

- saved items persist and are searchable

## Phase 5: editable write-back

Deliverables:

- replace selection
- insert before
- insert after

Acceptance:

- write-back works in at least TextEdit, Notes, and one browser editable field

## Phase 6: auto-popup

Deliverables:

- native selection event observation
- debounce logic
- floating action bar placement
- close rules

Acceptance:

- action bar opens consistently on tested apps without flashing or stale text

## Phase 7: browser adapters

Deliverables:

- Safari support
- Chrome support
- Arc support
- URL capture where available

Acceptance:

- browser selection plus result flow works in at least Safari and Chrome

## Phase 8: packaging and QA

Deliverables:

- macOS bundle metadata
- `Info.plist`
- Apple Events usage strings if needed
- notarized DMG pipeline
- regression checklist

Acceptance:

- signed build installs cleanly on another Mac

## 13. Risks and Controls

### Risk 1: native bridge takes longer than expected

Control:

- manual shortcut path first
- bridge returns minimal structured data only

### Risk 2: browser support is inconsistent

Control:

- browser adapters are Phase 7, not core Phase 2
- ship best-effort browser support, not universal browser claims

### Risk 3: write-back is unreliable

Control:

- support copy-only and save-only flows even when replace/insert is unavailable

### Risk 4: Tauri window behavior feels webby

Control:

- keep the action bar tiny
- push layout and animation quality into CSS and positioning logic
- avoid building a full-page web app disguised as a desktop utility

### Risk 5: clean-room discipline drifts

Control:

- every new feature starts from a requirement or test case in this repo
- no implementation work should depend on reading old source files

## 14. Definition of Done for v0.1

`v0.1` is done when all of these are true:

- app runs as a tray/menu bar utility
- Kimi can rewrite selected text with `To English`
- Kimi can rewrite selected text with `Expand`
- original text can be saved to SQLite
- sentence library supports search / copy / delete / favorite
- manual shortcut works reliably in TextEdit and Notes
- auto-popup works in at least two tested apps
- build can be packaged as a macOS app bundle and DMG

## 15. Immediate Next Steps

Do these next, in this order:

1. scaffold Tauri v2 app in this directory
2. add `store`, `sql`, and `global-shortcut` plugins
3. set macOS minimum version to `13.0`
4. add custom `Info.plist`
5. implement settings persistence
6. implement manual selection bridge
7. wire Kimi end to end

## 16. Official References

- Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri distribute: https://v2.tauri.app/distribute/
- Tauri macOS application bundle: https://v2.tauri.app/distribute/macos-application-bundle/
- Tauri plugin overview: https://v2.tauri.app/plugin/
- Tauri plugin development: https://v2.tauri.app/develop/plugins/
- Tauri SQL plugin: https://v2.tauri.app/plugin/sql/
- Tauri Store plugin: https://v2.tauri.app/plugin/store/
- Tauri Global Shortcut plugin: https://v2.tauri.app/plugin/global-shortcut/
- Tauri system tray guide: https://v2.tauri.app/learn/system-tray/

## 17. Notes on Inference

These points are implementation inferences, not direct claims from Tauri docs:

- using a tiny native bridge is the fastest practical path for macOS text selection
- direct auto-popup should come after the manual shortcut path
- phase 1 should avoid App Store and sandbox targets
