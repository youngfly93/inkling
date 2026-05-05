mod commands;
mod logging;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIcon, TrayIconBuilder},
    ActivationPolicy, Manager, RunEvent, WindowEvent,
};

static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

struct AppTray<R: tauri::Runtime>(TrayIcon<R>);

fn load_tray_icon() -> tauri::Result<Image<'static>> {
    let decoded = image::load_from_memory_with_format(
        include_bytes!("../icons/trayTemplate.png"),
        image::ImageFormat::Png,
    )
    .map_err(|error| std::io::Error::other(format!("tray icon decode failed: {error}")))?;
    let rgba = decoded.to_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(Image::new_owned(rgba.into_raw(), width, height))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .on_window_event(|window, event| {
            if !window.label().starts_with("actionbar") {
                return;
            }

            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    logging::debug(format!("Actionbar close requested: {}", window.label()));
                    api.prevent_close();
                }
                WindowEvent::Destroyed => {
                    logging::debug(format!("Actionbar destroyed: {}", window.label()));
                }
                WindowEvent::Focused(focused) => {
                    logging::debug(format!(
                        "Actionbar focus changed: {} -> {}",
                        window.label(),
                        focused
                    ));
                }
                WindowEvent::Moved(position) => {
                    logging::debug(format!(
                        "Actionbar moved event: {} -> ({}, {})",
                        window.label(),
                        position.x,
                        position.y
                    ));
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:seleany.db", commands::library::migrations())
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            // Build tray menu
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let library_item = MenuItemBuilder::with_id("library", "Inkling Library").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&library_item)
                .item(&settings_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray_icon = load_tray_icon()?;

            let tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "settings" => {
                        commands::windowing::open_settings(app);
                    }
                    "library" => {
                        commands::windowing::open_library(app);
                    }
                    "quit" => {
                        ALLOW_EXIT.store(true, Ordering::Relaxed);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Keep the tray alive for the whole app lifetime. If the last TrayIcon
            // instance is dropped, macOS removes the status item and the accessory app
            // can disappear with no visible surface left.
            let _ = app.manage(AppTray(tray));

            // Start selection monitor (auto-popup on text selection)
            commands::selection::start_monitor(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai::transform_text,
            commands::ai::custom_text_action,
            commands::selection::get_selection,
            commands::selection::replace_selection,
            commands::selection::undo_last_replace,
            commands::windowing::get_current_selection,
            commands::windowing::get_cursor_position,
            commands::windowing::set_actionbar_busy,
            commands::windowing::dismiss_action_bar,
            commands::windowing::set_actionbar_input_mode,
            commands::windowing::open_settings_window,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_runtime_status,
            commands::settings::open_accessibility_settings,
            commands::settings::repair_bridge_permissions,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_, event| {
        if let RunEvent::ExitRequested { api, code, .. } = event {
            logging::debug(format!("App exit requested: {:?}", code));
            if !ALLOW_EXIT.load(Ordering::Relaxed) {
                api.prevent_exit();
            }
        }
    });
}
