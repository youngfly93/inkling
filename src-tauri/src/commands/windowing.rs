use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use super::selection::SelectionSnapshot;
use crate::logging;

#[cfg(target_os = "macos")]
use cocoa::base::{id, NO, YES};
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

// Global state to hold the current selection for the action bar
pub static CURRENT_SELECTION: Mutex<Option<SelectionSnapshot>> = Mutex::new(None);

// Flag: true when an AI action or save is in progress
pub static ACTIONBAR_BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
pub struct CursorPosition {
    pub x: f64,
    pub y: f64,
}

pub fn is_actionbar_busy(_app: &AppHandle) -> bool {
    ACTIONBAR_BUSY.load(Ordering::Relaxed)
}

pub fn is_actionbar_visible(app: &AppHandle) -> bool {
    app.get_webview_window(ACTIONBAR_LABEL)
        .and_then(|win| win.is_visible().ok())
        .unwrap_or(false)
}

pub fn close_action_bars(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(ACTIONBAR_LABEL) {
        logging::debug("Hiding actionbar");
        let _ = win.hide();
    }

    ACTIONBAR_BUSY.store(false, Ordering::Relaxed);

    if let Ok(mut sel) = CURRENT_SELECTION.lock() {
        *sel = None;
    }
}

pub fn is_clear_click_inside_actionbar(app: &AppHandle, snapshot: &SelectionSnapshot) -> bool {
    let Some(win) = app.get_webview_window(ACTIONBAR_LABEL) else {
        return false;
    };

    if !win.is_visible().unwrap_or(false) {
        return false;
    }

    let Ok(position) = win.outer_position() else {
        return false;
    };
    let Ok(size) = win.outer_size() else {
        return false;
    };

    let scale_factor = win.scale_factor().unwrap_or(1.0);
    let mouse_x = snapshot.mouse_x * scale_factor;
    let mouse_y = snapshot.mouse_y * scale_factor;
    let margin = 8.0 * scale_factor;
    let left = position.x as f64 - margin;
    let top = position.y as f64 - margin;
    let right = position.x as f64 + size.width as f64 + margin;
    let bottom = position.y as f64 + size.height as f64 + margin;

    mouse_x >= left && mouse_x <= right && mouse_y >= top && mouse_y <= bottom
}

#[tauri::command]
pub fn dismiss_action_bar(app: AppHandle) {
    if is_actionbar_busy(&app) {
        return;
    }

    close_action_bars(&app);
}

#[tauri::command]
pub fn set_actionbar_input_mode(app: AppHandle, enabled: bool) {
    let Some(win) = app.get_webview_window(ACTIONBAR_LABEL) else {
        return;
    };

    let _ = win.set_focusable(enabled);
    if enabled {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

pub fn open_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("/#/settings".into()))
        .title("Inkling Settings")
        .inner_size(720.0, 760.0)
        .min_inner_size(620.0, 640.0)
        .resizable(true)
        .center()
        .build();
}

pub fn open_library(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("library") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "library", WebviewUrl::App("/#/library".into()))
        .title("Inkling Library")
        .inner_size(640.0, 500.0)
        .min_inner_size(480.0, 300.0)
        .center()
        .build();
}

const ACTIONBAR_LABEL: &str = "actionbar";
const ACTIONBAR_WINDOW_WIDTH: f64 = 18.0;
const ACTIONBAR_WINDOW_HEIGHT: f64 = 18.0;

fn configure_actionbar_panel(win: &WebviewWindow) {
    let _ = win.set_shadow(false);

    #[cfg(target_os = "macos")]
    if let Ok(ns_window) = win.ns_window() {
        unsafe {
            let ns_window = ns_window as id;
            let _: () = msg_send![ns_window, setAcceptsMouseMovedEvents: YES];
            let _: () = msg_send![ns_window, setIgnoresMouseEvents: NO];
        }
    }
}

fn calc_position(app: &AppHandle, snapshot: &SelectionSnapshot) -> (f64, f64) {
    let dock_w = ACTIONBAR_WINDOW_WIDTH;
    let dock_h = ACTIONBAR_WINDOW_HEIGHT;
    let margin = 8.0;

    // Prefer snapshot coordinates (captured at event time) over live cursor
    let reference = snapshot
        .anchor_x
        .zip(snapshot.anchor_y)
        .unwrap_or((snapshot.mouse_x, snapshot.mouse_y));

    let (work_x, work_y, work_w, work_h) = app
        .monitor_from_point(reference.0, reference.1)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .map(|m| {
            let a = *m.work_area();
            (
                a.position.x as f64,
                a.position.y as f64,
                a.size.width as f64,
                a.size.height as f64,
            )
        })
        .unwrap_or((0.0, 0.0, 1440.0, 900.0));

    // Keep the orb centered on the selection rectangle's bottom-right anchor.
    let (base_x, base_y) =
        if let Some((anchor_x, anchor_y)) = snapshot.anchor_x.zip(snapshot.anchor_y) {
            (anchor_x - dock_w / 2.0, anchor_y - dock_h / 2.0)
        } else {
            (
                snapshot.mouse_x - dock_w / 2.0,
                snapshot.mouse_y - dock_h / 2.0,
            )
        };

    let x = base_x.clamp(
        work_x + margin,
        (work_x + work_w - dock_w - margin).max(work_x + margin),
    );
    let y = base_y.clamp(
        work_y + margin,
        (work_y + work_h - dock_h - margin).max(work_y + margin),
    );
    (x, y)
}

pub fn open_action_bar(app: &AppHandle, snapshot: &SelectionSnapshot) {
    // Store selection in global state
    if let Ok(mut sel) = CURRENT_SELECTION.lock() {
        *sel = Some(snapshot.clone());
    }

    let (x, y) = calc_position(app, snapshot);

    // Reuse existing window — just move and show
    if let Some(win) = app.get_webview_window(ACTIONBAR_LABEL) {
        configure_actionbar_panel(&win);
        let _ = win.set_size(LogicalSize::new(
            ACTIONBAR_WINDOW_WIDTH,
            ACTIONBAR_WINDOW_HEIGHT,
        ));
        let _ = win.set_position(LogicalPosition::new(x, y));
        let _ = win.set_ignore_cursor_events(false);
        let _ = win.set_focusable(false);
        let _ = win.show();
        let _ = app.emit("selection-ready", snapshot);
        logging::debug(format!("Action bar reused at logical ({}, {})", x, y));
        return;
    }

    // First time: create the window
    logging::debug(format!("Creating action bar at ({}, {})", x, y));
    let win_result =
        WebviewWindowBuilder::new(app, ACTIONBAR_LABEL, WebviewUrl::App("/#/actionbar".into()))
            .title("Inkling")
            .inner_size(ACTIONBAR_WINDOW_WIDTH, ACTIONBAR_WINDOW_HEIGHT)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .resizable(false)
            .skip_taskbar(true)
            .transparent(true)
            .focusable(false)
            .focused(false)
            .accept_first_mouse(true)
            .build();

    match win_result {
        Ok(win) => {
            configure_actionbar_panel(&win);
            let _ = win.set_ignore_cursor_events(false);
            let _ = win.set_focusable(false);
            let _ = win.set_position(LogicalPosition::new(x, y));
            let _ = win.show();
            logging::debug(format!("Action bar created at logical ({}, {})", x, y));

            // Emit after window loads
            let handle = app.clone();
            let snap = snapshot.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                let _ = handle.emit("selection-ready", &snap);
            });
        }
        Err(e) => logging::error(format!("Action bar FAILED: {}", e)),
    }
}

#[tauri::command]
pub fn set_actionbar_busy(busy: bool) {
    ACTIONBAR_BUSY.store(busy, Ordering::Relaxed);
    logging::debug(format!("Actionbar busy: {}", busy));
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) {
    open_settings(&app);
}

#[tauri::command]
pub fn get_current_selection() -> Result<SelectionSnapshot, String> {
    CURRENT_SELECTION
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?
        .clone()
        .ok_or_else(|| "No selection available".to_string())
}

#[tauri::command]
pub fn get_cursor_position(app: AppHandle) -> Result<CursorPosition, String> {
    let pos = app
        .cursor_position()
        .map_err(|e| format!("Cursor position error: {}", e))?;

    Ok(CursorPosition { x: pos.x, y: pos.y })
}
