import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PolishStyle, TranslateMode } from "./actionbar/aiClient";

const MODELS = ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"];

const TRANSLATE_MODES: Array<{ id: TranslateMode; label: string; detail: string }> = [
  {
    id: "auto",
    label: "Auto",
    detail: "Chinese-led text goes to English; English-led text goes to Chinese.",
  },
  {
    id: "to_chinese",
    label: "To Chinese",
    detail: "Always return natural Simplified Chinese.",
  },
  {
    id: "to_english",
    label: "To English",
    detail: "Always return natural English.",
  },
];

const POLISH_STYLES: Array<{ id: PolishStyle; label: string; detail: string }> = [
  {
    id: "balanced",
    label: "Balanced",
    detail: "Natural, clear, and faithful to the original tone.",
  },
  {
    id: "concise",
    label: "Concise",
    detail: "Tighter wording with less repetition.",
  },
  {
    id: "formal",
    label: "Formal",
    detail: "More composed and public-facing.",
  },
  {
    id: "friendly",
    label: "Friendly",
    detail: "Warmer and more approachable.",
  },
  {
    id: "professional",
    label: "Professional",
    detail: "Sharper, confident, and businesslike.",
  },
  {
    id: "custom",
    label: "Custom",
    detail: "Use your own polish instruction.",
  },
];

const SUPPORT_MATRIX = [
  {
    app: "TextEdit",
    mode: "Replace",
    detail: "Good baseline for end-to-end replace and undo validation.",
  },
  {
    app: "Notes",
    mode: "Replace",
    detail: "Editable notes should allow direct write-back after rewrite.",
  },
  {
    app: "Notion editors",
    mode: "Replace",
    detail: "Use inside editable blocks or inputs, not in read-only page content.",
  },
  {
    app: "Browsers / chat history / web articles",
    mode: "Copy only",
    detail: "Selections can be read, but write-back is intentionally hidden in read-only surfaces.",
  },
];

const QUICK_TIPS = [
  "Keep the original text highlighted until Replace finishes.",
  "If Replace is hidden, Inkling considers the current surface read-only.",
  "If the source selection changes before Replace, Inkling blocks the write-back instead of guessing.",
];

const SETTINGS_SECTIONS = [
  { id: "runtime", label: "Runtime" },
  { id: "ai-provider", label: "AI Provider" },
  { id: "actions", label: "Actions" },
  { id: "compatibility", label: "Compatibility" },
] as const;

interface RuntimeStatus {
  accessibilityTrusted: boolean;
  kimiApiKeyConfigured: boolean;
  apiHost: string;
  model: string;
  sidecarAvailable: boolean;
  sidecarExecutable: boolean;
  bridgePath: string;
  selectionMonitorRunning: boolean;
  monitorLastError: string | null;
  actionbarVisible: boolean;
  actionbarBusy: boolean;
  currentSelection: SelectionDiagnostic | null;
  lastSelection: SelectionDiagnostic | null;
}

interface SelectionDiagnostic {
  app: string;
  appName: string;
  textLength: number;
  editable: boolean;
  method: string;
  capturedAtMs: number;
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [apiHost, setApiHost] = useState("api.moonshot.cn");
  const [model, setModel] = useState("moonshot-v1-8k");
  const [translateMode, setTranslateMode] = useState<TranslateMode>("auto");
  const [polishStyle, setPolishStyle] = useState<PolishStyle>("balanced");
  const [polishCustomInstruction, setPolishCustomInstruction] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [runtimeActionStatus, setRuntimeActionStatus] = useState<string | null>(null);

  useEffect(() => {
    void refreshAll();

    const handleFocus = () => {
      void refreshStatus();
    };
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 4000);

    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  async function refreshAll() {
    await Promise.all([loadSettings(), refreshStatus()]);
  }

  async function refreshStatus() {
    try {
      const runtime = await invoke<RuntimeStatus>("get_runtime_status");
      setStatus(runtime);
      setStatusError(null);
    } catch (e) {
      console.error("Failed to read runtime status:", e);
      setStatusError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadSettings() {
    try {
      const key = await invoke<string | null>("get_setting", { key: "kimi_api_key" });
      const host = await invoke<string | null>("get_setting", { key: "kimi_api_host" });
      const m = await invoke<string | null>("get_setting", { key: "kimi_model" });
      const mode = await invoke<string | null>("get_setting", { key: "translate_mode" });
      const style = await invoke<string | null>("get_setting", { key: "polish_style" });
      const customInstruction = await invoke<string | null>("get_setting", { key: "polish_custom_instruction" });
      setApiKey(key || "");
      setApiHost(host || "api.moonshot.cn");
      setModel(m || "moonshot-v1-8k");
      setTranslateMode(mode === "to_chinese" || mode === "to_english" ? mode : "auto");
      setPolishStyle(
        style === "concise" ||
          style === "formal" ||
          style === "friendly" ||
          style === "professional" ||
          style === "custom"
          ? style
          : "balanced"
      );
      setPolishCustomInstruction(customInstruction || "");
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await invoke("set_setting", { key: "kimi_api_key", value: apiKey.trim() });
      await invoke("set_setting", { key: "kimi_api_host", value: apiHost.trim() || "api.moonshot.cn" });
      await invoke("set_setting", { key: "kimi_model", value: model });
      await invoke("set_setting", { key: "translate_mode", value: translateMode });
      await invoke("set_setting", { key: "polish_style", value: polishStyle });
      await invoke("set_setting", {
        key: "polish_custom_instruction",
        value: polishCustomInstruction.trim(),
      });
      await refreshStatus();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  }

  async function openAccessibilitySettings() {
    try {
      await invoke("open_accessibility_settings");
      setRuntimeActionStatus("Opened macOS Accessibility settings.");
    } catch (e) {
      console.error("Failed to open Accessibility settings:", e);
      setRuntimeActionStatus(e instanceof Error ? e.message : String(e));
    }
  }

  async function repairBridgePermissions() {
    try {
      await invoke("repair_bridge_permissions");
      await refreshStatus();
      setRuntimeActionStatus("Bridge permission repaired.");
    } catch (e) {
      console.error("Failed to repair bridge permissions:", e);
      setRuntimeActionStatus(e instanceof Error ? e.message : String(e));
    }
  }

  function formatSelectionSummary(selection: SelectionDiagnostic | null | undefined): string {
    if (!selection) {
      return "No live selection";
    }

    const source = selection.appName || selection.app || "Unknown app";
    const editability = selection.editable ? "editable" : "read-only";
    return `${selection.textLength} chars from ${source} · ${editability} · ${selection.method}`;
  }

  function formatStatusTime(timestampMs: number): string {
    if (!timestampMs) {
      return "unknown time";
    }

    return new Date(timestampMs).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function selectionSource(selection: SelectionDiagnostic | null | undefined): string {
    return selection?.appName || selection?.app || "None";
  }

  function renderSelectionCard(title: string, selection: SelectionDiagnostic | null | undefined) {
    return (
      <div className="settings-selection-card">
        <div className="settings-selection-title">{title}</div>
        {selection ? (
          <div className="settings-selection-facts">
            <div>
              <span>Source</span>
              <strong>{selectionSource(selection)}</strong>
            </div>
            <div>
              <span>Length</span>
              <strong>{selection.textLength} chars</strong>
            </div>
            <div>
              <span>Surface</span>
              <strong>{selection.editable ? "Editable" : "Read-only"}</strong>
            </div>
            <div>
              <span>Method</span>
              <strong>{selection.method}</strong>
            </div>
            <div>
              <span>Captured</span>
              <strong>{formatStatusTime(selection.capturedAtMs)}</strong>
            </div>
          </div>
        ) : (
          <div className="settings-selection-empty">No selection recorded.</div>
        )}
      </div>
    );
  }

  function scrollToSettingsSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const readinessItems = [
    {
      label: "Selection monitor",
      ok: !!status?.selectionMonitorRunning,
      detail: status?.selectionMonitorRunning
        ? "Running. Inkling is listening for new macOS selections."
        : status?.monitorLastError
          ? `Stopped. Last error: ${status.monitorLastError}`
          : "Stopped. Restart Inkling if selection capture does not recover.",
    },
    {
      label: "Accessibility permission",
      ok: !!status?.accessibilityTrusted,
      detail: status?.accessibilityTrusted
        ? "Granted. Inkling can monitor selections and write back in supported editors."
        : "Missing. Enable Inkling under System Settings > Privacy & Security > Accessibility.",
    },
    {
      label: "Kimi API key",
      ok: !!status?.kimiApiKeyConfigured,
      detail: status?.kimiApiKeyConfigured
        ? "Configured. AI actions can reach Kimi."
        : "Missing. Add a Kimi API key below before using Translate, Polish, Grammar, Explain, Summarize, or Ask AI.",
    },
    {
      label: "Native selection bridge",
      ok: !!status?.sidecarAvailable && !!status?.sidecarExecutable,
      detail: status?.sidecarAvailable && status?.sidecarExecutable
        ? "Ready. macOS selection monitoring and replace logic are available."
        : status?.sidecarAvailable
          ? "Found, but not executable. Fix file permissions on the native bridge binary."
          : "Missing. The native selection bridge binary is unavailable.",
    },
  ];

  const readyCount = readinessItems.filter((item) => item.ok).length;
  const diagnostics = [
    {
      label: "Action bar",
      value: status?.actionbarVisible
        ? status.actionbarBusy
          ? "Visible · busy"
          : "Visible · idle"
        : "Hidden",
    },
    {
      label: "Current selection",
      value: formatSelectionSummary(status?.currentSelection),
    },
    {
      label: "Last selection",
      value: status?.lastSelection
        ? `${formatSelectionSummary(status.lastSelection)} · ${formatStatusTime(status.lastSelection.capturedAtMs)}`
        : "No selection captured yet",
    },
    {
      label: "Bridge path",
      value: status?.bridgePath || "Unknown",
      mono: true,
    },
    {
      label: "Monitor note",
      value: status?.monitorLastError || "No monitor errors reported",
    },
  ];

  return (
    <div className="settings-shell">
      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Settings sections">
          <div className="settings-nav-brand">Inkling</div>
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSettingsSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </aside>

        <main className="settings-main">
          <div className="settings-hero">
            <div>
              <div className="settings-kicker">Settings</div>
              <h1>Setup and preferences</h1>
              <p>
                Configure the AI provider, tune action behavior, and verify whether the macOS
                runtime is ready for selection capture and Replace.
              </p>
            </div>
            <div className="settings-hero-actions">
              <button className="settings-secondary-btn" onClick={() => void refreshStatus()}>
                Refresh status
              </button>
              <button onClick={saveSettings} className="settings-primary-btn" disabled={saving}>
                {saving ? "Saving..." : saved ? "Saved" : "Save settings"}
              </button>
            </div>
          </div>

          <section id="runtime" className="settings-readiness-card">
            <div className="settings-readiness-head">
              <div>
                <h2>Runtime</h2>
                <p>{readyCount} of {readinessItems.length} requirements are ready.</p>
              </div>
              <div className={`settings-pill ${readyCount === readinessItems.length ? "is-ready" : "is-warning"}`}>
                {readyCount === readinessItems.length ? "Ready to test" : "Action needed"}
              </div>
            </div>

            <div className="settings-status-grid">
              {readinessItems.map((item) => (
                <div key={item.label} className="settings-status-card">
                  <div className={`settings-status-dot ${item.ok ? "is-ok" : "is-bad"}`} />
                  <div>
                    <div className="settings-status-title">{item.label}</div>
                    <div className="settings-status-detail">{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="settings-runtime-actions">
              <button className="settings-secondary-btn" onClick={() => void openAccessibilitySettings()}>
                Open Accessibility
              </button>
              <button
                className="settings-secondary-btn"
                disabled={!status?.sidecarAvailable || !!status?.sidecarExecutable}
                onClick={() => void repairBridgePermissions()}
              >
                Repair bridge permission
              </button>
            </div>
            {runtimeActionStatus && <div className="settings-action-note">{runtimeActionStatus}</div>}

            <div className="settings-diagnostics">
              <h3>Diagnostics</h3>
              <div className="settings-diagnostic-list">
                {diagnostics.map((item) => (
                  <div key={item.label} className="settings-diagnostic-row">
                    <span className="settings-diagnostic-label">{item.label}</span>
                    <span className={item.mono ? "settings-diagnostic-value settings-mono" : "settings-diagnostic-value"}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="settings-selection-grid">
                {renderSelectionCard("Current selection", status?.currentSelection)}
                {renderSelectionCard("Last captured", status?.lastSelection)}
              </div>
            </div>

            {statusError && <div className="settings-inline-error">Runtime status failed: {statusError}</div>}
          </section>

          <section id="ai-provider" className="settings-panel">
            <div className="settings-panel-head">
              <div>
                <h2>AI Provider</h2>
                <p>Credentials and model used by Ask, Translate, Polish, Grammar, Explain, and Summarize.</p>
              </div>
              {status && (
                <div className="settings-runtime-summary">
                  <span>Host: {status.apiHost}</span>
                  <span>Model: {status.model}</span>
                </div>
              )}
            </div>

            <div className="settings-form-grid">
              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>

              <div className="form-group">
                <label>API Host</label>
                <input
                  type="text"
                  value={apiHost}
                  onChange={(e) => setApiHost(e.target.value)}
                  placeholder="api.moonshot.cn"
                />
              </div>

              <div className="form-group">
                <label>Model</label>
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="settings-field-note">
              Missing API keys are surfaced inside the floating bar before any AI request is sent.
            </div>
          </section>

          <section id="actions" className="settings-panel">
            <div className="settings-panel-head">
              <div>
                <h2>Action Preferences</h2>
                <p>Defaults used by the Dock actions. Changes apply the next time an action runs.</p>
              </div>
            </div>

            <div className="settings-preference-group">
              <div>
                <h3>Translate target</h3>
                <p>Keep one Translate button in the Dock while controlling the output language here.</p>
              </div>
              <div className="settings-choice-row" role="group" aria-label="Translate target">
                {TRANSLATE_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`settings-choice ${translateMode === mode.id ? "is-active" : ""}`}
                    aria-pressed={translateMode === mode.id}
                    onClick={() => setTranslateMode(mode.id)}
                  >
                    <span>{mode.label}</span>
                    <small>{mode.detail}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-preference-group">
              <div>
                <h3>Polish style</h3>
                <p>Choose a default tone, or use Custom to inject your own instruction.</p>
              </div>
              <div className="settings-choice-row settings-choice-row-polish" role="group" aria-label="Polish style">
                {POLISH_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    className={`settings-choice ${polishStyle === style.id ? "is-active" : ""}`}
                    aria-pressed={polishStyle === style.id}
                    onClick={() => setPolishStyle(style.id)}
                  >
                    <span>{style.label}</span>
                    <small>{style.detail}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className={`form-group settings-custom-polish ${polishStyle === "custom" ? "is-active" : ""}`}>
              <label>Custom polish instruction</label>
              <textarea
                value={polishCustomInstruction}
                onChange={(e) => setPolishCustomInstruction(e.target.value)}
                placeholder="Example: Keep my tone casual, but make the wording clearer and more confident."
                rows={3}
              />
              <div className="settings-field-note">
                Used when Polish style is Custom. If Custom is selected but this is empty, Inkling falls back to Balanced.
              </div>
            </div>
          </section>

          <section id="compatibility" className="settings-panel">
            <div className="settings-panel-head">
              <div>
                <h2>Compatibility</h2>
                <p>What Replace can do depends on the active macOS app and whether the surface is editable.</p>
              </div>
            </div>

            <div className="settings-matrix">
              {SUPPORT_MATRIX.map((item) => (
                <div key={item.app} className="settings-matrix-row">
                  <div>
                    <div className="settings-matrix-app">{item.app}</div>
                    <div className="settings-matrix-detail">{item.detail}</div>
                  </div>
                  <div className={`settings-pill ${item.mode === "Replace" ? "is-ready" : "is-muted"}`}>
                    {item.mode}
                  </div>
                </div>
              ))}
            </div>

            <div className="settings-subsection">
              <h3>Operator notes</h3>
              <div className="settings-tips">
                {QUICK_TIPS.map((tip) => (
                  <div key={tip} className="settings-tip">
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
