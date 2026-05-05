use std::{
    fs, io,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};

use crate::logging;

const OLD_IDENTIFIER: &str = "com.seleany.pro";
pub const DATABASE_FILE: &str = "inkling.db";
pub const DATABASE_URL: &str = "sqlite:inkling.db";
const OLD_DATABASE_FILE: &str = "seleany.db";
const SETTINGS_FILE: &str = "settings.json";

pub fn migrate_legacy_identity(app: &AppHandle) {
    if let Err(error) = try_migrate_legacy_identity(app) {
        logging::error(format!("Identity migration failed: {error}"));
    }
}

fn try_migrate_legacy_identity(app: &AppHandle) -> io::Result<()> {
    let new_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| io::Error::other(error.to_string()))?;
    let new_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| io::Error::other(error.to_string()))?;

    let Some(old_data_dir) = sibling_identifier_dir(&new_data_dir, OLD_IDENTIFIER) else {
        return Ok(());
    };
    let Some(old_config_dir) = sibling_identifier_dir(&new_config_dir, OLD_IDENTIFIER) else {
        return Ok(());
    };

    migrate_file_if_missing(
        "settings",
        &[
            old_data_dir.join(SETTINGS_FILE),
            old_config_dir.join(SETTINGS_FILE),
        ],
        &new_data_dir.join(SETTINGS_FILE),
    )?;
    migrate_file_if_missing(
        "library database",
        &[
            old_config_dir.join(OLD_DATABASE_FILE),
            old_data_dir.join(OLD_DATABASE_FILE),
        ],
        &new_config_dir.join(DATABASE_FILE),
    )?;

    Ok(())
}

fn sibling_identifier_dir(current_dir: &Path, identifier: &str) -> Option<PathBuf> {
    current_dir.parent().map(|parent| parent.join(identifier))
}

fn migrate_file_if_missing(label: &str, sources: &[PathBuf], destination: &Path) -> io::Result<()> {
    if destination.exists() && destination.metadata()?.len() > 0 {
        return Ok(());
    }

    let Some(source) = sources.iter().find(|path| path.is_file()) else {
        return Ok(());
    };

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, destination)?;
    logging::debug(format!(
        "Migrated legacy {label} from {} to {}",
        source.display(),
        destination.display()
    ));

    Ok(())
}
