use serde::{Deserialize, Serialize};

pub const SETTINGS_DIR_NAME: &str = "project-dashboard";
pub const SETTINGS_FILE_NAME: &str = "settings.json";
pub const EVENT_REFRESH_PROJECTS: &str = "tray://refresh-projects";
pub const APP_MENU_ID: &str = "app-menu";
pub const APP_MENU_SHOW_ID: &str = "show";
pub const TRAY_ICON_ID: &str = "project-dashboard-tray";
pub const TRAY_ICON_SIZE: u32 = 64;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsResponse {
    pub project_root: String,
    pub default_project_root: String,
    pub preferred_terminal: String,
    pub tray_icon: String,
    pub card_actions: Vec<String>,
    pub layout: String,
    pub app_theme: String,
}

#[derive(Deserialize, Serialize)]
pub struct StoredSettings {
    pub project_root: String,
    #[serde(default = "default_preferred_terminal")]
    pub preferred_terminal: String,
    #[serde(default = "default_tray_icon")]
    pub tray_icon: String,
    #[serde(default = "default_card_actions")]
    pub card_actions: Vec<String>,
    #[serde(default = "default_layout")]
    pub layout: String,
    #[serde(default = "default_app_theme")]
    pub app_theme: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub name: String,
    pub path: String,
    pub workspace_path: Option<String>,
    pub has_workspace: bool,
    pub is_git_repo: bool,
    pub git_branch: Option<String>,
    pub git_common_dir: Option<String>,
    pub git_worktree_count: Option<usize>,
    pub is_primary_worktree: Option<bool>,
    pub last_modified_epoch_ms: Option<u64>,
    pub tech_tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeEntry {
    pub name: String,
    pub path: String,
    pub display_path: String,
    pub workspace_path: Option<String>,
    pub has_workspace: bool,
    pub branch: Option<String>,
    pub is_current: bool,
    pub is_primary: bool,
    pub is_detached: bool,
    pub is_locked: bool,
    pub is_prunable: bool,
    pub is_bare: bool,
    pub is_dirty: bool,
    pub is_stale: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectWorkspaceResult {
    pub project_path: String,
    pub workspace_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGitWorktreeResult {
    pub project_path: String,
    pub workspace_path: Option<String>,
    pub branch: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitEntry {
    pub short_hash: String,
    pub subject: String,
    pub relative_time: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchEntry {
    pub name: String,
    pub is_current: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFileEntry {
    pub path: String,
    pub status: String,
    pub badge: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOverview {
    pub current_branch: String,
    pub upstream_branch: Option<String>,
    pub ahead_count: u32,
    pub behind_count: u32,
    pub is_dirty: bool,
    pub changed_files: Vec<GitChangedFileEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDetails {
    pub short_hash: String,
    pub full_hash: String,
    pub subject: String,
    pub body: String,
    pub author_name: String,
    pub author_email: String,
    pub authored_relative_time: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNoteEntry {
    pub version: String,
    pub items: Vec<String>,
}

pub struct GitProjectSummary {
    pub branch: Option<String>,
    pub common_dir: String,
    pub worktree_count: usize,
    pub is_primary_worktree: bool,
}

#[derive(Default)]
pub struct ParsedGitWorktreeRecord {
    pub path: String,
    pub branch: Option<String>,
    pub is_primary: bool,
    pub is_detached: bool,
    pub is_locked: bool,
    pub is_prunable: bool,
    pub is_bare: bool,
}

pub fn default_preferred_terminal() -> String {
    "auto".to_string()
}

pub fn default_tray_icon() -> String {
    "grid".to_string()
}

pub fn default_card_actions() -> Vec<String> {
    vec![
        "workspace".to_string(),
        "opencode".to_string(),
        "terminal".to_string(),
    ]
}

pub fn default_layout() -> String {
    "standard".to_string()
}

pub fn default_app_theme() -> String {
    "neon".to_string()
}

pub fn supported_terminals() -> &'static [&'static str] {
    &[
        "auto",
        "x-terminal-emulator",
        "gnome-terminal",
        "terminator",
        "ptyxis",
        "kgx",
        "konsole",
        "xfce4-terminal",
        "tilix",
        "alacritty",
        "kitty",
        "wezterm",
        "foot",
    ]
}

pub fn supported_tray_icons() -> &'static [&'static str] {
    &["grid", "orbit", "stacks"]
}

pub fn supported_card_actions() -> &'static [&'static str] {
    &["workspace", "folder", "terminal", "opencode", "git", "none"]
}

pub fn supported_layouts() -> &'static [&'static str] {
    &["standard", "sidebar-dock"]
}

pub fn supported_app_themes() -> &'static [&'static str] {
    &["default", "neon", "ember", "fjord", "signal"]
}

pub fn normalize_preferred_terminal(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_lowercase();

    if supported_terminals().contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!("Unsupported terminal preference: {value}"))
    }
}

pub fn normalize_tray_icon(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_lowercase();

    if supported_tray_icons().contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!("Unsupported tray icon: {value}"))
    }
}

pub fn normalize_card_actions(values: &[String]) -> Result<Vec<String>, String> {
    if values.len() != 3 {
        return Err("Project card actions must contain exactly three slots.".to_string());
    }

    let mut normalized = Vec::with_capacity(values.len());

    for value in values {
        let action = value.trim().to_lowercase();

        if supported_card_actions().contains(&action.as_str()) {
            normalized.push(action);
        } else {
            return Err(format!("Unsupported project card action: {value}"));
        }
    }

    Ok(normalized)
}

pub fn normalize_layout(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_lowercase();

    if normalized == "default" || normalized == "sidebar" {
        return Ok("standard".to_string());
    }

    if supported_layouts().contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!("Unsupported layout: {value}"))
    }
}

pub fn normalize_app_theme(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_lowercase();

    if supported_app_themes().contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!("Unsupported app theme: {value}"))
    }
}
