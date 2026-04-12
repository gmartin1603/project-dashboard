use std::{fs, path::PathBuf};

use crate::types::{
    default_app_theme, default_card_actions, default_layout, default_preferred_terminal,
    default_tray_icon, normalize_app_theme, normalize_card_actions, normalize_layout,
    normalize_preferred_terminal, normalize_tray_icon, AppSettingsResponse, StoredSettings,
    SETTINGS_DIR_NAME, SETTINGS_FILE_NAME,
};

pub fn default_project_root() -> PathBuf {
    dirs::home_dir()
        .map(|home| home.join("code"))
        .unwrap_or_else(|| PathBuf::from("./code"))
}

fn settings_file_path() -> Result<PathBuf, String> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| "Could not determine the config directory".to_string())?;
    Ok(config_dir.join(SETTINGS_DIR_NAME).join(SETTINGS_FILE_NAME))
}

pub fn load_settings() -> Result<StoredSettings, String> {
    let default_root = default_project_root().to_string_lossy().into_owned();
    let settings_path = settings_file_path()?;

    if !settings_path.exists() {
        return Ok(StoredSettings {
            project_root: default_root,
            preferred_terminal: default_preferred_terminal(),
            tray_icon: default_tray_icon(),
            card_actions: default_card_actions(),
            layout: default_layout(),
            app_theme: default_app_theme(),
        });
    }

    let raw = fs::read_to_string(&settings_path)
        .map_err(|error| format!("Could not read {}: {error}", settings_path.display()))?;
    let settings: StoredSettings = serde_json::from_str(&raw)
        .map_err(|error| format!("Could not parse {}: {error}", settings_path.display()))?;

    if settings.project_root.trim().is_empty() {
        Ok(StoredSettings {
            project_root: default_root,
            preferred_terminal: normalize_preferred_terminal(&settings.preferred_terminal)
                .unwrap_or_else(|_| default_preferred_terminal()),
            tray_icon: normalize_tray_icon(&settings.tray_icon)
                .unwrap_or_else(|_| default_tray_icon()),
            card_actions: normalize_card_actions(&settings.card_actions)
                .unwrap_or_else(|_| default_card_actions()),
            layout: normalize_layout(&settings.layout).unwrap_or_else(|_| default_layout()),
            app_theme: normalize_app_theme(&settings.app_theme)
                .unwrap_or_else(|_| default_app_theme()),
        })
    } else {
        Ok(StoredSettings {
            project_root: settings.project_root,
            preferred_terminal: normalize_preferred_terminal(&settings.preferred_terminal)
                .unwrap_or_else(|_| default_preferred_terminal()),
            tray_icon: normalize_tray_icon(&settings.tray_icon)
                .unwrap_or_else(|_| default_tray_icon()),
            card_actions: normalize_card_actions(&settings.card_actions)
                .unwrap_or_else(|_| default_card_actions()),
            layout: normalize_layout(&settings.layout).unwrap_or_else(|_| default_layout()),
            app_theme: normalize_app_theme(&settings.app_theme)
                .unwrap_or_else(|_| default_app_theme()),
        })
    }
}

pub fn save_settings(settings: &StoredSettings) -> Result<(), String> {
    let settings_path = settings_file_path()?;
    let parent = settings_path
        .parent()
        .ok_or_else(|| "Could not determine the settings directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;

    let serialized = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Could not serialize settings: {error}"))?;
    fs::write(&settings_path, serialized)
        .map_err(|error| format!("Could not write {}: {error}", settings_path.display()))?;
    Ok(())
}

pub fn configured_project_root() -> Result<PathBuf, String> {
    let settings = load_settings()?;
    let configured_path = PathBuf::from(&settings.project_root);

    if !configured_path.exists() {
        return Err(format!(
            "Configured project root {} does not exist. Update it in the app settings.",
            configured_path.display()
        ));
    }

    if !configured_path.is_dir() {
        return Err(format!(
            "Configured project root {} is not a directory.",
            configured_path.display()
        ));
    }

    fs::canonicalize(&configured_path)
        .map_err(|error| format!("Could not access {}: {error}", configured_path.display()))
}

pub fn app_settings_response() -> Result<AppSettingsResponse, String> {
    let settings = load_settings()?;
    Ok(AppSettingsResponse {
        project_root: settings.project_root,
        default_project_root: default_project_root().to_string_lossy().into_owned(),
        preferred_terminal: settings.preferred_terminal,
        tray_icon: settings.tray_icon,
        card_actions: settings.card_actions,
        layout: settings.layout,
        app_theme: settings.app_theme,
    })
}
