import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const MODELS = ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"];

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
      setApiKey(key || "");
      setApiHost(host || "api.moonshot.cn");
      setModel(m || "moonshot-v1-8k");
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
      <div className="settings-hero">
        <div>
          <div className="settings-kicker">Inkling</div>
          <h1>Setup and support</h1>
          <p>
            Inkling works best when it can both read a live selection and write back into editable
            text fields. This screen shows whether the runtime is ready, how Replace behaves, and
            which surfaces are intentionally copy-only.
          </p>
        </div>
        <button className="settings-secondary-btn" onClick={() => void refreshStatus()}>
          Refresh status
        </button>
      </div>

      <section className="settings-readiness-card">
        <div className="settings-readiness-head">
          <div>
            <h2>Readiness</h2>
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
          <h3>Runtime diagnostics</h3>
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

      <section className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <h2>Kimi configuration</h2>
            <p>These values control AI rewrite requests from the floating action bar.</p>
          </div>
          {status && (
            <div className="settings-runtime-summary">
              <span>Host: {status.apiHost}</span>
              <span>Model: {status.model}</span>
            </div>
          )}
        </div>

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

        <div className="settings-actions-row">
          <button
            onClick={saveSettings}
            className="settings-primary-btn"
            disabled={saving}
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save configuration"}
          </button>
          <div className="settings-help-copy">
            Missing key is now surfaced directly inside the floating bar before any API call is made.
          </div>
        </div>
      </section>

      <section className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <h2>Support matrix</h2>
            <p>Use this to set expectations before testing a new app or surface.</p>
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
      </section>

      <section className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <h2>Operator notes</h2>
            <p>Small rules that make the product feel predictable instead of magical.</p>
          </div>
        </div>
        <div className="settings-tips">
          {QUICK_TIPS.map((tip) => (
            <div key={tip} className="settings-tip">
              {tip}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
