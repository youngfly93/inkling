use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command as StdCommand;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SelectionSnapshot {
    pub text: String,
    pub app: String,
    #[serde(rename = "appName")]
    pub app_name: String,
    pub url: String,
    pub editable: bool,
    pub method: String,
    #[serde(rename = "mouseX")]
    pub mouse_x: f64,
    #[serde(rename = "mouseY")]
    pub mouse_y: f64,
}

#[derive(Debug, Deserialize)]
struct ReplaceBridgeResponse {
    ok: bool,
    method: String,
}

#[derive(Debug, Serialize)]
struct ReplaceBridgeRequest {
    #[serde(rename = "replacementText")]
    replacement_text: String,
    #[serde(rename = "expectedOriginalText")]
    expected_original_text: String,
}

#[derive(Debug, Deserialize)]
struct UndoBridgeResponse {
    ok: bool,
}

#[derive(Debug, Deserialize)]
struct ErrorBridgeResponse {
    error: String,
}

#[derive(Debug, Clone)]
struct ReplacementHistory {
    target_app: String,
    original_text: String,
    replacement_text: String,
    method: String,
    timestamp_ms: u128,
}

static LAST_REPLACEMENT: Mutex<Option<ReplacementHistory>> = Mutex::new(None);

#[tauri::command]
pub async fn get_selection(app: tauri::AppHandle) -> Result<SelectionSnapshot, String> {
    let sidecar = app
        .shell()
        .sidecar("selection-bridge")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?;

    let output = sidecar
        .output()
        .await
        .map_err(|e| format!("Failed to run bridge: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if !output.status.success() {
        return Err(stdout);
    }

    serde_json::from_str::<SelectionSnapshot>(&stdout)
        .map_err(|e| format!("Parse error: {} (raw: {})", e, stdout))
}

#[tauri::command]
pub async fn replace_selection(
    app: tauri::AppHandle,
    text: String,
    original_text: String,
    target_app: Option<String>,
) -> Result<(), String> {
    let bridge_path = resolve_bridge_path(&app);
    let target_app = target_app
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Missing target app for replace".to_string())?;
    let request_body = serde_json::to_vec(&ReplaceBridgeRequest {
        replacement_text: text.clone(),
        expected_original_text: original_text.clone(),
    })
    .map_err(|e| format!("Failed to encode replace payload: {}", e))?;

    tokio::task::spawn_blocking(move || {
        let mut child = StdCommand::new(&bridge_path)
            .arg("--replace")
            .arg(&target_app)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start replace bridge: {}", e))?;

        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(&request_body)
                .map_err(|e| format!("Failed to send replace payload: {}", e))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed waiting for replace bridge: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let payload = serde_json::from_str::<ReplaceBridgeResponse>(&stdout)
                .map_err(|e| format!("Invalid replace response: {} (raw: {})", e, stdout))?;

            if !payload.ok {
                return Err("replace_failed".to_string());
            }

            let timestamp_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);

            if let Ok(mut history) = LAST_REPLACEMENT.lock() {
                *history = Some(ReplacementHistory {
                    target_app,
                    original_text,
                    replacement_text: text,
                    method: payload.method,
                    timestamp_ms,
                });
            }

            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Err(bridge_error_message(&stdout, &stderr, "replace_failed"))
        }
    })
    .await
    .map_err(|e| format!("Replace task failed: {}", e))?
}

#[tauri::command]
pub async fn undo_last_replace(app: tauri::AppHandle) -> Result<(), String> {
    let bridge_path = resolve_bridge_path(&app);
    let history = LAST_REPLACEMENT
        .lock()
        .map_err(|e| format!("Undo history lock error: {}", e))?
        .clone()
        .ok_or_else(|| "No replace history to undo".to_string())?;

    eprintln!(
        "Undoing last replacement for {} using {} at {}",
        history.target_app, history.method, history.timestamp_ms
    );

    let target_app = history.target_app.clone();
    let original_text = history.original_text.clone();
    let replacement_text = history.replacement_text.clone();

    tokio::task::spawn_blocking(move || {
        let output = StdCommand::new(&bridge_path)
            .arg("--undo")
            .arg(&target_app)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to start undo bridge: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let payload = serde_json::from_str::<UndoBridgeResponse>(&stdout)
                .map_err(|e| format!("Invalid undo response: {} (raw: {})", e, stdout))?;
            if payload.ok {
                Ok(())
            } else {
                Err("undo_failed".to_string())
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Err(bridge_error_message(
                &stdout,
                &stderr,
                &format!(
                    "undo_failed for {} ({} -> {})",
                    target_app, original_text, replacement_text
                ),
            ))
        }
    })
    .await
    .map_err(|e| format!("Undo task failed: {}", e))??;

    if let Ok(mut history) = LAST_REPLACEMENT.lock() {
        *history = None;
    }

    Ok(())
}

pub(crate) fn resolve_bridge_path(app: &tauri::AppHandle) -> PathBuf {
    let resource_dir = app.path().resource_dir().unwrap_or_default();

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    if let Some(dir) = exe_dir {
        let p = dir.join("selection-bridge");
        if p.exists() {
            return p;
        }
    }

    resource_dir.join("selection-bridge")
}

fn bridge_error_message(stdout: &str, stderr: &str, fallback: &str) -> String {
    if !stderr.is_empty() {
        return stderr.to_string();
    }

    if !stdout.is_empty() {
        if let Ok(payload) = serde_json::from_str::<ErrorBridgeResponse>(stdout) {
            return payload.error;
        }
        return stdout.to_string();
    }

    fallback.to_string()
}

/// Spawn the selection-bridge in --monitor mode as a long-running process.
/// Each time it detects a selection, it emits a "selection-captured" event.
pub fn start_monitor(app: &tauri::AppHandle) {
    let handle = app.clone();
    let bridge_path = resolve_bridge_path(app);

    eprintln!("Starting monitor from: {:?}", bridge_path);

    std::thread::spawn(move || {
        let child = StdCommand::new(&bridge_path)
            .arg("--monitor")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn();

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to start monitor: {}", e);
                return;
            }
        };

        let stdout = child.stdout.take().unwrap();
        let reader = std::io::BufReader::new(stdout);

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };

            if line.trim().is_empty() {
                continue;
            }

            match serde_json::from_str::<SelectionSnapshot>(&line) {
                Ok(snapshot) => {
                    if snapshot.method == "clear" || snapshot.text.trim().is_empty() {
                        // Give actionbar clicks a short chance to claim focus, but do not
                        // keep stale bars hanging around for the old 600ms delay.
                        let h = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(std::time::Duration::from_millis(120)).await;
                            if super::windowing::is_actionbar_busy(&h) {
                                eprintln!("Monitor: skipping clear, actionbar is busy");
                                return;
                            }
                            eprintln!("Monitor: clearing action bar");
                            super::windowing::close_action_bars(&h);
                        });
                        continue;
                    }

                    eprintln!("Monitor: selection {} chars from {}", snapshot.text.len(), snapshot.app);
                    let _ = handle.emit("selection-captured", &snapshot);

                    // Open action bar on main thread
                    let h = handle.clone();
                    let s = snapshot.clone();
                    tauri::async_runtime::spawn(async move {
                        super::windowing::open_action_bar(&h, &s);
                    });
                }
                Err(e) => {
                    eprintln!("Monitor parse error: {} (line: {})", e, line);
                }
            }
        }

        eprintln!("Monitor process ended");
    });
}
