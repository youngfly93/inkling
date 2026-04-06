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
  "If Replace is hidden, Seleany considers the current surface read-only.",
  "If the source selection changes before Replace, Seleany now blocks the write-back instead of guessing.",
];

interface RuntimeStatus {
  accessibilityTrusted: boolean;
  kimiApiKeyConfigured: boolean;
  apiHost: string;
  model: string;
  sidecarAvailable: boolean;
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [apiHost, setApiHost] = useState("api.moonshot.cn");
  const [model, setModel] = useState("moonshot-v1-8k");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    void refreshAll();

    const handleFocus = () => {
      void refreshStatus();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
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

  const readinessItems = [
    {
      label: "Accessibility permission",
      ok: !!status?.accessibilityTrusted,
      detail: status?.accessibilityTrusted
        ? "Granted. Seleany can monitor selections and write back in supported editors."
        : "Missing. Enable Seleany under System Settings > Privacy & Security > Accessibility.",
    },
    {
      label: "Kimi API key",
      ok: !!status?.kimiApiKeyConfigured,
      detail: status?.kimiApiKeyConfigured
        ? "Configured. AI actions can reach Kimi."
        : "Missing. Add a Kimi API key below before using To English, To Chinese, or Expand.",
    },
    {
      label: "Native selection bridge",
      ok: !!status?.sidecarAvailable,
      detail: status?.sidecarAvailable
        ? "Ready. macOS selection monitoring and replace logic are available."
        : "Missing. The native selection bridge binary is unavailable.",
    },
  ];

  const readyCount = readinessItems.filter((item) => item.ok).length;

  return (
    <div className="settings-shell">
      <div className="settings-hero">
        <div>
          <div className="settings-kicker">Seleany Pro</div>
          <h1>Setup and support</h1>
          <p>
            Seleany works best when it can both read a live selection and write back into editable
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
