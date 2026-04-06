mod commands;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    ActivationPolicy,
    Manager,
    RunEvent,
    WindowEvent,
};

static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .on_window_event(|window, event| {
            if !window.label().starts_with("actionbar") {
                return;
            }

            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    eprintln!("Actionbar close requested: {}", window.label());
                    api.prevent_close();
                }
                WindowEvent::Destroyed => {
                    eprintln!("Actionbar destroyed: {}", window.label());
                }
                WindowEvent::Focused(focused) => {
                    eprintln!("Actionbar focus changed: {} -> {}", window.label(), focused);
                }
                WindowEvent::Moved(position) => {
                    eprintln!(
                        "Actionbar moved event: {} -> ({}, {})",
                        window.label(),
                        position.x,
                        position.y
                    );
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
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
            let library_item =
                MenuItemBuilder::with_id("library", "Sentence Library").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&library_item)
                .item(&settings_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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
            commands::windowing::set_actionbar_busy,
            commands::windowing::open_settings_window,
            commands::library::save_sentence,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_runtime_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_, event| {
        if let RunEvent::ExitRequested { api, code, .. } = event {
            eprintln!("App exit requested: {:?}", code);
            if !ALLOW_EXIT.load(Ordering::Relaxed) {
                api.prevent_exit();
            }
        }
    });
}
