use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};

const AUTOSTART_DIR_NAME: &str = "autostart";
const DESKTOP_ENTRY_NAME: &str = "project-dashboard.desktop";
const SETTINGS_DIR_NAME: &str = "project-dashboard";
const SETTINGS_FILE_NAME: &str = "settings.json";
const EVENT_REFRESH_PROJECTS: &str = "tray://refresh-projects";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSettingsResponse {
    project_root: String,
    default_project_root: String,
}

#[derive(Deserialize, Serialize)]
struct StoredSettings {
    project_root: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectEntry {
    name: String,
    path: String,
    workspace_path: Option<String>,
    has_workspace: bool,
    is_git_repo: bool,
    last_modified_epoch_ms: Option<u64>,
    tech_tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommitEntry {
    short_hash: String,
    subject: String,
    relative_time: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchEntry {
    name: String,
    is_current: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitOverview {
    current_branch: String,
    upstream_branch: Option<String>,
    ahead_count: u32,
    behind_count: u32,
    is_dirty: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommitDetails {
    short_hash: String,
    full_hash: String,
    subject: String,
    body: String,
    author_name: String,
    author_email: String,
    authored_relative_time: String,
}

fn desktop_entry_contents(binary_path: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Project Dashboard\nExec={}\nIcon=project-dashboard\nTerminal=false\nCategories=Development;Utility;\nStartupNotify=true\n",
        binary_path.display()
    )
}

fn default_project_root() -> PathBuf {
    dirs::home_dir()
        .map(|home| home.join("code"))
        .unwrap_or_else(|| PathBuf::from("./code"))
}

fn settings_file_path() -> Result<PathBuf, String> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| "Could not determine the config directory".to_string())?;
    Ok(config_dir.join(SETTINGS_DIR_NAME).join(SETTINGS_FILE_NAME))
}

fn load_settings() -> Result<StoredSettings, String> {
    let default_root = default_project_root().to_string_lossy().into_owned();
    let settings_path = settings_file_path()?;

    if !settings_path.exists() {
        return Ok(StoredSettings {
            project_root: default_root,
        });
    }

    let raw = fs::read_to_string(&settings_path)
        .map_err(|error| format!("Could not read {}: {error}", settings_path.display()))?;
    let settings: StoredSettings = serde_json::from_str(&raw)
        .map_err(|error| format!("Could not parse {}: {error}", settings_path.display()))?;

    if settings.project_root.trim().is_empty() {
        Ok(StoredSettings {
            project_root: default_root,
        })
    } else {
        Ok(settings)
    }
}

fn save_settings(settings: &StoredSettings) -> Result<(), String> {
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

fn configured_project_root() -> Result<PathBuf, String> {
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

fn app_settings_response() -> Result<AppSettingsResponse, String> {
    let settings = load_settings()?;
    Ok(AppSettingsResponse {
        project_root: settings.project_root,
        default_project_root: default_project_root().to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn get_app_settings() -> Result<AppSettingsResponse, String> {
    app_settings_response()
}

#[tauri::command]
fn update_project_root(project_root: String) -> Result<AppSettingsResponse, String> {
    let candidate = PathBuf::from(project_root.trim());

    if candidate.as_os_str().is_empty() {
        return Err("Project root cannot be empty.".to_string());
    }

    if !candidate.exists() {
        return Err(format!("{} does not exist.", candidate.display()));
    }

    if !candidate.is_dir() {
        return Err(format!("{} is not a directory.", candidate.display()));
    }

    let canonical = fs::canonicalize(&candidate)
        .map_err(|error| format!("Could not access {}: {error}", candidate.display()))?;

    save_settings(&StoredSettings {
        project_root: canonical.to_string_lossy().into_owned(),
    })?;

    app_settings_response()
}

#[tauri::command]
fn list_projects() -> Result<Vec<ProjectEntry>, String> {
    let root = configured_project_root()?;
    let entries = fs::read_dir(&root)
        .map_err(|error| format!("Could not read {}: {error}", root.display()))?;

    let mut projects = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();

            if !path.is_dir() {
                return None;
            }

            let name = path.file_name()?.to_string_lossy().into_owned();
            let workspace_path = find_workspace(&path);
            let has_workspace = workspace_path.is_some();
            let is_git_repo = path.join(".git").exists();
            let tech_tags = detect_tech_tags(&path);
            let last_modified_epoch_ms = entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64);

            Some(ProjectEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                workspace_path: workspace_path
                    .map(|workspace| workspace.to_string_lossy().into_owned()),
                has_workspace,
                is_git_repo,
                last_modified_epoch_ms,
                tech_tags,
            })
        })
        .collect::<Vec<_>>();

    projects.sort_by(|left, right| {
        right
            .has_workspace
            .cmp(&left.has_workspace)
            .then_with(|| {
                right
                    .last_modified_epoch_ms
                    .cmp(&left.last_modified_epoch_ms)
            })
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(projects)
}

#[tauri::command]
fn open_in_code(target_path: String) -> Result<(), String> {
    let candidate = validate_path_within_code_root(&target_path)?;

    let status = Command::new("code")
        .arg("--new-window")
        .arg(&candidate)
        .status()
        .map_err(|error| format!("Could not launch VS Code: {error}"))?;

    if !status.success() {
        return Err(format!("VS Code exited with status {status}"));
    }

    Ok(())
}

#[tauri::command]
fn get_git_history(
    project_path: String,
    branch_name: Option<String>,
) -> Result<Vec<GitCommitEntry>, String> {
    let candidate = validate_path_within_code_root(&project_path)?;

    if !candidate.join(".git").exists() {
        return Err(format!("{} is not a git repository", candidate.display()));
    }

    let history_target = branch_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("HEAD");

    let output = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .arg("log")
        .arg(history_target)
        .arg("--max-count=12")
        .arg("--pretty=format:%h%x1f%s%x1f%cr")
        .output()
        .map_err(|error| format!("Could not read git history: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git log failed with status {}", output.status)
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits = stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\x1f');
            let short_hash = parts.next()?.trim().to_string();
            let subject = parts.next()?.trim().to_string();
            let relative_time = parts.next()?.trim().to_string();

            Some(GitCommitEntry {
                short_hash,
                subject,
                relative_time,
            })
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
fn list_git_branches(project_path: String) -> Result<Vec<GitBranchEntry>, String> {
    let candidate = validate_path_within_code_root(&project_path)?;

    if !candidate.join(".git").exists() {
        return Err(format!("{} is not a git repository", candidate.display()));
    }

    let current_output = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .arg("branch")
        .arg("--show-current")
        .output()
        .map_err(|error| format!("Could not read current branch: {error}"))?;

    if !current_output.status.success() {
        let stderr = String::from_utf8_lossy(&current_output.stderr)
            .trim()
            .to_string();
        return Err(if stderr.is_empty() {
            format!("Git branch failed with status {}", current_output.status)
        } else {
            stderr
        });
    }

    let current_branch = String::from_utf8_lossy(&current_output.stdout)
        .trim()
        .to_string();

    let output = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .arg("for-each-ref")
        .arg("refs/heads")
        .arg("--format=%(refname:short)")
        .output()
        .map_err(|error| format!("Could not read git branches: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git branch failed with status {}", output.status)
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches = stdout
        .lines()
        .filter_map(|line| {
            let name = line.trim().to_string();
            if name.is_empty() {
                return None;
            }

            Some(GitBranchEntry {
                name,
                is_current: false,
            })
        })
        .collect::<Vec<_>>();

    for branch in &mut branches {
        branch.is_current = branch.name == current_branch;
    }

    branches.sort_by(|left, right| {
        right
            .is_current
            .cmp(&left.is_current)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(branches)
}

#[tauri::command]
fn get_git_overview(project_path: String) -> Result<GitOverview, String> {
    let candidate = validate_path_within_code_root(&project_path)?;

    if !candidate.join(".git").exists() {
        return Err(format!("{} is not a git repository", candidate.display()));
    }

    let output = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .arg("status")
        .arg("--porcelain=2")
        .arg("--branch")
        .output()
        .map_err(|error| format!("Could not read git overview: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git status failed with status {}", output.status)
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut current_branch = String::from("HEAD");
    let mut upstream_branch = None;
    let mut ahead_count = 0;
    let mut behind_count = 0;
    let mut is_dirty = false;

    for line in stdout.lines() {
        if let Some(value) = line.strip_prefix("# branch.head ") {
            current_branch = value.trim().to_string();
        } else if let Some(value) = line.strip_prefix("# branch.upstream ") {
            upstream_branch = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("# branch.ab ") {
            let parts = value.split_whitespace().collect::<Vec<_>>();
            for part in parts {
                if let Some(ahead) = part.strip_prefix('+') {
                    ahead_count = ahead.parse::<u32>().unwrap_or(0);
                } else if let Some(behind) = part.strip_prefix('-') {
                    behind_count = behind.parse::<u32>().unwrap_or(0);
                }
            }
        } else if !line.trim().is_empty() && !line.starts_with('#') {
            is_dirty = true;
        }
    }

    Ok(GitOverview {
        current_branch,
        upstream_branch,
        ahead_count,
        behind_count,
        is_dirty,
    })
}

#[tauri::command]
fn get_git_commit_details(
    project_path: String,
    commit_ref: String,
) -> Result<GitCommitDetails, String> {
    let candidate = validate_path_within_code_root(&project_path)?;

    if !candidate.join(".git").exists() {
        return Err(format!("{} is not a git repository", candidate.display()));
    }

    let output = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .arg("show")
        .arg("--no-patch")
        .arg("--format=%h%x1f%H%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%cr")
        .arg(&commit_ref)
        .output()
        .map_err(|error| format!("Could not read commit details: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git show failed with status {}", output.status)
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parts = stdout.splitn(7, '\x1f');

    Ok(GitCommitDetails {
        short_hash: parts.next().unwrap_or_default().trim().to_string(),
        full_hash: parts.next().unwrap_or_default().trim().to_string(),
        subject: parts.next().unwrap_or_default().trim().to_string(),
        body: parts.next().unwrap_or_default().trim().to_string(),
        author_name: parts.next().unwrap_or_default().trim().to_string(),
        author_email: parts.next().unwrap_or_default().trim().to_string(),
        authored_relative_time: parts.next().unwrap_or_default().trim().to_string(),
    })
}

fn find_workspace(project_path: &Path) -> Option<PathBuf> {
    let project_name = project_path.file_name()?.to_string_lossy().to_lowercase();
    let search_paths = [project_path.to_path_buf(), project_path.join(".vscode")];
    let mut candidates = Vec::new();

    for search_path in search_paths {
        let Ok(entries) = fs::read_dir(&search_path) else {
            continue;
        };

        for entry in entries.flatten() {
            let candidate_path = entry.path();
            let Some(extension) = candidate_path.extension().and_then(|value| value.to_str())
            else {
                continue;
            };

            if extension != "code-workspace" {
                continue;
            }

            let file_stem = candidate_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_lowercase();
            let is_root_file = candidate_path.parent() == Some(project_path);
            let score = match file_stem == project_name {
                true => 0,
                false if file_stem.contains(&project_name) => 1,
                false if is_root_file => 2,
                false => 3,
            };

            candidates.push((score, candidate_path));
        }
    }

    candidates.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    candidates.into_iter().map(|(_, path)| path).next()
}

fn detect_tech_tags(project_path: &Path) -> Vec<String> {
    let mut tags = Vec::new();

    if project_path.join("package.json").exists() {
        push_tag(&mut tags, "node");
    }
    if project_path.join("bun.lockb").exists() || project_path.join("bun.lock").exists() {
        push_tag(&mut tags, "bun");
    }
    if project_path.join("pnpm-lock.yaml").exists() {
        push_tag(&mut tags, "pnpm");
    }
    if project_path.join("yarn.lock").exists() {
        push_tag(&mut tags, "yarn");
    }
    if project_path.join("deno.json").exists() || project_path.join("deno.jsonc").exists() {
        push_tag(&mut tags, "deno");
    }
    if project_path.join("Cargo.toml").exists() {
        push_tag(&mut tags, "rust");
    }
    if project_path.join("pyproject.toml").exists()
        || project_path.join("requirements.txt").exists()
        || project_path.join("Pipfile").exists()
    {
        push_tag(&mut tags, "python");
    }
    if project_path.join("go.mod").exists() {
        push_tag(&mut tags, "go");
    }
    if project_path.join("composer.json").exists() {
        push_tag(&mut tags, "php");
    }
    if project_path.join("Gemfile").exists() {
        push_tag(&mut tags, "ruby");
    }
    if project_path.join("pubspec.yaml").exists() {
        push_tag(&mut tags, "dart");
    }
    if project_path.join("pom.xml").exists()
        || project_path.join("build.gradle").exists()
        || project_path.join("build.gradle.kts").exists()
    {
        push_tag(&mut tags, "java");
    }
    if project_path.join("CMakeLists.txt").exists() {
        push_tag(&mut tags, "cpp");
    }
    if has_any_extension(project_path, &["sln", "csproj", "fsproj", "vbproj"]) {
        push_tag(&mut tags, "dotnet");
    }

    tags
}

fn validate_path_within_code_root(target_path: &str) -> Result<PathBuf, String> {
    let root = configured_project_root()?;
    let candidate = fs::canonicalize(target_path)
        .map_err(|error| format!("Could not access {target_path}: {error}"))?;

    if !candidate.starts_with(&root) {
        return Err(format!(
            "Refused to access {} because it is outside {}",
            candidate.display(),
            root.display()
        ));
    }

    Ok(candidate)
}

fn has_any_extension(project_path: &Path, extensions: &[&str]) -> bool {
    let Ok(entries) = fs::read_dir(project_path) else {
        return false;
    };

    entries.flatten().any(|entry| {
        entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extensions.contains(&extension))
    })
}

fn push_tag(tags: &mut Vec<String>, tag: &str) {
    if !tags.iter().any(|existing| existing == tag) {
        tags.push(tag.to_string());
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn autostart_entry_path() -> Option<PathBuf> {
    let config_dir = dirs::config_dir()?;
    Some(config_dir.join(AUTOSTART_DIR_NAME).join(DESKTOP_ENTRY_NAME))
}

fn is_launch_on_login_enabled() -> bool {
    autostart_entry_path().is_some_and(|path| path.exists())
}

fn set_launch_on_login(enabled: bool) -> Result<(), String> {
    let Some(autostart_path) = autostart_entry_path() else {
        return Err("Could not determine the autostart directory".to_string());
    };

    if enabled {
        let executable = std::env::current_exe()
            .map_err(|error| format!("Could not determine current executable: {error}"))?;
        let parent = autostart_path
            .parent()
            .ok_or_else(|| "Could not determine the autostart parent directory".to_string())?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
        fs::write(&autostart_path, desktop_entry_contents(&executable))
            .map_err(|error| format!("Could not write {}: {error}", autostart_path.display()))?;
    } else if autostart_path.exists() {
        fs::remove_file(&autostart_path)
            .map_err(|error| format!("Could not remove {}: {error}", autostart_path.display()))?;
    }

    Ok(())
}

fn sync_launch_on_login_item<R: tauri::Runtime>(item: &CheckMenuItem<R>) {
    let _ = item.set_checked(is_launch_on_login_enabled());
}

fn build_tray(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let show_item = MenuItem::with_id(app, "show", "Show Project Dashboard", true, None::<&str>)?;
    let refresh_item = MenuItem::with_id(app, "refresh", "Refresh Projects", true, None::<&str>)?;
    let launch_on_login_item = CheckMenuItem::with_id(
        app,
        "launch_on_login",
        "Launch on Login",
        true,
        is_launch_on_login_enabled(),
        None::<&str>,
    )?;
    let launch_on_login_item_handle = launch_on_login_item.clone();
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show_item, &refresh_item, &launch_on_login_item, &quit_item],
    )?;
    let icon = app.default_window_icon().cloned();

    let mut tray_builder = TrayIconBuilder::with_id("project-dashboard-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "refresh" => {
                let _ = app.emit(EVENT_REFRESH_PROJECTS, ());
                show_main_window(app);
            }
            "launch_on_login" => {
                let enabled = !is_launch_on_login_enabled();
                let _ = set_launch_on_login(enabled);
                sync_launch_on_login_item(&launch_on_login_item_handle);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = icon {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let _tray = build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_settings,
            update_project_root,
            list_projects,
            open_in_code,
            get_git_history,
            list_git_branches,
            get_git_overview,
            get_git_commit_details
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
