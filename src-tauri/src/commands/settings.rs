use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::process::Command as StdCommand;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub accessibility_trusted: bool,
    pub kimi_api_key_configured: bool,
    pub api_host: String,
    pub model: String,
    pub sidecar_available: bool,
    pub sidecar_executable: bool,
    pub bridge_path: String,
    pub selection_monitor_running: bool,
    pub monitor_last_error: Option<String>,
    pub actionbar_visible: bool,
    pub actionbar_busy: bool,
    pub current_selection: Option<super::selection::SelectionDiagnostic>,
    pub last_selection: Option<super::selection::SelectionDiagnostic>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeHealth {
    accessibility_trusted: bool,
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    path.metadata()
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let metadata = path
        .metadata()
        .map_err(|e| format!("Bridge metadata error: {}", e))?;
    let mut permissions = metadata.permissions();
    permissions.set_mode(permissions.mode() | 0o755);
    fs::set_permissions(path, permissions).map_err(|e| format!("Bridge chmod error: {}", e))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Err("Bridge permission repair is only available on Unix platforms.".to_string())
}

#[tauri::command]
pub async fn get_setting(app: tauri::AppHandle, key: String) -> Result<Value, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Store error: {}", e))?;

    Ok(store.get(&key).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn set_setting(app: tauri::AppHandle, key: String, value: Value) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Store error: {}", e))?;

    store.set(&key, value);
    store.save().map_err(|e| format!("Save error: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        StdCommand::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map_err(|e| format!("Failed to open Accessibility settings: {}", e))?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Accessibility settings shortcut is only available on macOS.".to_string())
    }
}

#[tauri::command]
pub fn repair_bridge_permissions(app: tauri::AppHandle) -> Result<(), String> {
    let bridge_path = super::selection::resolve_bridge_path(&app);
    if !bridge_path.exists() {
        return Err(format!(
            "Bridge binary does not exist at {}",
            bridge_path.display()
        ));
    }

    make_executable(&bridge_path)
}

#[tauri::command]
pub async fn get_runtime_status(app: tauri::AppHandle) -> Result<RuntimeStatus, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Store error: {}", e))?;

    let api_key = store
        .get("kimi_api_key")
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default();
    let api_host = store
        .get("kimi_api_host")
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "api.moonshot.cn".to_string());
    let model = store
        .get("kimi_model")
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "moonshot-v1-8k".to_string());

    let bridge_path = super::selection::resolve_bridge_path(&app);
    let sidecar_available = bridge_path.exists();
    let sidecar_executable = is_executable(&bridge_path);
    let accessibility_trusted = if sidecar_executable {
        StdCommand::new(&bridge_path)
            .arg("--health")
            .output()
            .ok()
            .and_then(|output| {
                if !output.status.success() {
                    return None;
                }
                serde_json::from_slice::<BridgeHealth>(&output.stdout).ok()
            })
            .map(|payload| payload.accessibility_trusted)
            .unwrap_or(false)
    } else {
        false
    };
    let current_selection = super::windowing::CURRENT_SELECTION
        .lock()
        .ok()
        .and_then(|selection| {
            selection
                .as_ref()
                .map(super::selection::selection_diagnostic_from_snapshot)
        });

    Ok(RuntimeStatus {
        accessibility_trusted,
        kimi_api_key_configured: !api_key.trim().is_empty(),
        api_host,
        model,
        sidecar_available,
        sidecar_executable,
        bridge_path: bridge_path.display().to_string(),
        selection_monitor_running: super::selection::is_monitor_running(),
        monitor_last_error: super::selection::monitor_last_error(),
        actionbar_visible: super::windowing::is_actionbar_visible(&app),
        actionbar_busy: super::windowing::is_actionbar_busy(&app),
        current_selection,
        last_selection: super::selection::last_selection_diagnostic(),
    })
}
