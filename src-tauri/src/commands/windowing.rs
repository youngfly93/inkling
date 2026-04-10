use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use super::selection::SelectionSnapshot;

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
    if ACTIONBAR_BUSY.load(Ordering::Relaxed) {
        return true;
    }

    _app.get_webview_window(ACTIONBAR_LABEL)
        .and_then(|win| win.is_focused().ok())
        .unwrap_or(false)
}

pub fn close_action_bars(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(ACTIONBAR_LABEL) {
        eprintln!("Hiding actionbar");
        let _ = win.hide();
    }

    ACTIONBAR_BUSY.store(false, Ordering::Relaxed);

    if let Ok(mut sel) = CURRENT_SELECTION.lock() {
        *sel = None;
    }
}

pub fn open_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("/#/settings".into()))
        .title("Seleany Pro Settings")
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
        .title("Sentence Library")
        .inner_size(640.0, 500.0)
        .min_inner_size(480.0, 300.0)
        .center()
        .build();
}

const ACTIONBAR_LABEL: &str = "actionbar";
const ACTIONBAR_WINDOW_WIDTH: f64 = 18.0;
const ACTIONBAR_WINDOW_HEIGHT: f64 = 18.0;
const POINTER_FOLLOW_OFFSET_X: f64 = 6.0;
const POINTER_FOLLOW_OFFSET_Y: f64 = 6.0;

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

    let cursor = app
        .cursor_position()
        .unwrap_or_else(|_| PhysicalPosition::new(snapshot.mouse_x, snapshot.mouse_y));
    let anchor = if snapshot.app == "notion.id" {
        (cursor.x, cursor.y)
    } else {
        snapshot
            .anchor_x
            .zip(snapshot.anchor_y)
            .unwrap_or((cursor.x, cursor.y))
    };

    let (work_x, work_y, work_w, work_h) = app
        .monitor_from_point(anchor.0, anchor.1)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .map(|m| {
            let a = *m.work_area();
            (a.position.x as f64, a.position.y as f64, a.size.width as f64, a.size.height as f64)
        })
        .unwrap_or((0.0, 0.0, 1440.0, 900.0));

    let (base_x, base_y) = if snapshot.app == "notion.id" {
        (cursor.x + POINTER_FOLLOW_OFFSET_X, cursor.y + POINTER_FOLLOW_OFFSET_Y)
    } else if let Some((anchor_x, anchor_y)) = snapshot.anchor_x.zip(snapshot.anchor_y) {
        (anchor_x - dock_w, anchor_y - dock_h)
    } else {
        (cursor.x + 8.0, cursor.y + 8.0)
    };

    let x = base_x.clamp(work_x + margin, (work_x + work_w - dock_w - margin).max(work_x + margin));
    let y = base_y.clamp(work_y + margin, (work_y + work_h - dock_h - margin).max(work_y + margin));
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
        let _ = win.set_size(LogicalSize::new(ACTIONBAR_WINDOW_WIDTH, ACTIONBAR_WINDOW_HEIGHT));
        let _ = win.set_position(PhysicalPosition::new(x, y));
        let _ = win.set_ignore_cursor_events(false);
        let _ = win.set_focusable(true);
        let _ = win.show();
        let _ = app.emit("selection-ready", snapshot);
        eprintln!("Action bar reused at ({}, {})", x, y);
        return;
    }

    // First time: create the window
    eprintln!("Creating action bar at ({}, {})", x, y);
    let win_result = WebviewWindowBuilder::new(app, ACTIONBAR_LABEL, WebviewUrl::App("/#/actionbar".into()))
        .title("Seleany")
        .inner_size(ACTIONBAR_WINDOW_WIDTH, ACTIONBAR_WINDOW_HEIGHT)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .resizable(false)
        .skip_taskbar(true)
        .transparent(true)
        .focusable(true)
        .focused(false)
        .accept_first_mouse(true)
        .build();

    match win_result {
        Ok(win) => {
            configure_actionbar_panel(&win);
            let _ = win.set_ignore_cursor_events(false);
            let _ = win.set_focusable(true);
            let _ = win.set_position(PhysicalPosition::new(x, y));
            let _ = win.show();
            eprintln!("Action bar created OK");

            // Emit after window loads
            let handle = app.clone();
            let snap = snapshot.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                let _ = handle.emit("selection-ready", &snap);
            });
        }
        Err(e) => eprintln!("Action bar FAILED: {}", e),
    }
}

#[tauri::command]
pub fn set_actionbar_busy(busy: bool) {
    ACTIONBAR_BUSY.store(busy, Ordering::Relaxed);
    eprintln!("Actionbar busy: {}", busy);
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
