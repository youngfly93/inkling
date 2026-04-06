use serde::Serialize;
use serde_json::Value;
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
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeHealth {
    accessibility_trusted: bool,
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
    let accessibility_trusted = if sidecar_available {
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

    Ok(RuntimeStatus {
        accessibility_trusted,
        kimi_api_key_configured: !api_key.trim().is_empty(),
        api_host,
        model,
        sidecar_available,
    })
}
