use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::UNIX_EPOCH,
};

use tauri::AppHandle;

use crate::{
    git::resolve_git_project_summary,
    settings::{app_settings_response, load_settings, save_settings},
    tray::{sync_app_menu_icon, sync_main_window_icon, tray_icon_image},
    types::{
        normalize_app_theme, normalize_card_actions, normalize_layout,
        normalize_preferred_terminal, normalize_tray_icon, AppSettingsResponse, ProjectEntry,
        TRAY_ICON_ID,
    },
    workspace::{detect_tech_tags, find_workspace, validate_path_within_code_root},
};

fn shell_command(
    shell_text: &str,
    shell_arg: Option<&Path>,
    working_directory: Option<&Path>,
) -> Result<(), String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let shell_name = Path::new(&shell)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("sh");

    let mut command = Command::new(&shell);
    match shell_name {
        "fish" => {
            command.arg("-l").arg("-i").arg("-c").arg(shell_text);
        }
        _ => {
            command.arg("-lic").arg(shell_text);
        }
    }

    command.arg("project-dashboard");
    command.stdin(Stdio::null());
    command.stdout(Stdio::null());
    command.stderr(Stdio::null());

    if let Some(arg) = shell_arg {
        command.arg(arg);
    }

    if let Some(directory) = working_directory {
        command.current_dir(directory);
    }

    command
        .spawn()
        .map_err(|error| format!("Could not launch command: {error}"))?;

    Ok(())
}

fn escaped_path_display(path: &Path) -> String {
    path.to_string_lossy().replace('"', "\\\"")
}

fn terminal_launch_command(target_path: &Path, preferred_terminal: &str) -> String {
    let candidate_display = escaped_path_display(target_path);

    if preferred_terminal == "auto" {
        return format!(
            concat!(
                "if command -v x-terminal-emulator >/dev/null 2>&1; then x-terminal-emulator; ",
                "elif command -v gnome-terminal >/dev/null 2>&1; then gnome-terminal --working-directory=\"{0}\"; ",
                "elif command -v terminator >/dev/null 2>&1; then terminator --working-directory=\"{0}\"; ",
                "elif command -v ptyxis >/dev/null 2>&1; then ptyxis --new-window --working-directory \"{0}\"; ",
                "elif command -v kgx >/dev/null 2>&1; then kgx --working-directory=\"{0}\"; ",
                "elif command -v konsole >/dev/null 2>&1; then konsole --workdir \"{0}\"; ",
                "elif command -v xfce4-terminal >/dev/null 2>&1; then xfce4-terminal --working-directory=\"{0}\"; ",
                "elif command -v tilix >/dev/null 2>&1; then tilix --working-directory=\"{0}\"; ",
                "elif command -v alacritty >/dev/null 2>&1; then alacritty --working-directory \"{0}\"; ",
                "elif command -v kitty >/dev/null 2>&1; then kitty --directory \"{0}\"; ",
                "elif command -v wezterm >/dev/null 2>&1; then wezterm start --cwd \"{0}\"; ",
                "elif command -v foot >/dev/null 2>&1; then foot --working-directory=\"{0}\"; ",
                "else printf 'No supported terminal app was found in the shell environment.\\n' >&2; exit 127; fi"
            ),
            candidate_display
        );
    }

    let launch_command = match preferred_terminal {
        "x-terminal-emulator" => preferred_terminal.to_string(),
        "gnome-terminal" => {
            format!("gnome-terminal --working-directory=\"{candidate_display}\"")
        }
        "terminator" => format!("terminator --working-directory=\"{candidate_display}\""),
        "ptyxis" => format!("ptyxis --new-window --working-directory \"{candidate_display}\""),
        "kgx" => format!("kgx --working-directory=\"{candidate_display}\""),
        "konsole" => format!("konsole --workdir \"{candidate_display}\""),
        "xfce4-terminal" => {
            format!("xfce4-terminal --working-directory=\"{candidate_display}\"")
        }
        "tilix" => format!("tilix --working-directory=\"{candidate_display}\""),
        "alacritty" => format!("alacritty --working-directory \"{candidate_display}\""),
        "kitty" => format!("kitty --directory \"{candidate_display}\""),
        "wezterm" => format!("wezterm start --cwd \"{candidate_display}\""),
        "foot" => format!("foot --working-directory=\"{candidate_display}\""),
        _ => preferred_terminal.to_string(),
    };

    format!(
        "command -v {0} >/dev/null 2>&1 || {{ printf 'Preferred terminal \\\"{0}\\\" was not found in the shell environment.\\n' >&2; exit 127; }}; {1}",
        preferred_terminal, launch_command
    )
}

fn opencode_terminal_command(target_path: &Path, preferred_terminal: &str) -> String {
    let candidate_display = escaped_path_display(target_path);

    let launch_command = if preferred_terminal == "auto" {
        format!(
            concat!(
                "if command -v terminator >/dev/null 2>&1; then terminator --working-directory=\"{0}\" --geometry=140x44 -x opencode; ",
                "elif command -v gnome-terminal >/dev/null 2>&1; then gnome-terminal --working-directory=\"{0}\" -- opencode; ",
                "elif command -v x-terminal-emulator >/dev/null 2>&1; then x-terminal-emulator -e 'sh -lc \"cd \\\"{0}\\\" && exec opencode\"'; ",
                "elif command -v ptyxis >/dev/null 2>&1; then ptyxis --new-window --working-directory \"{0}\" -- opencode; ",
                "elif command -v kgx >/dev/null 2>&1; then kgx --working-directory=\"{0}\" opencode; ",
                "elif command -v konsole >/dev/null 2>&1; then konsole --workdir \"{0}\" -e opencode; ",
                "elif command -v xfce4-terminal >/dev/null 2>&1; then xfce4-terminal --working-directory=\"{0}\" -x opencode; ",
                "elif command -v tilix >/dev/null 2>&1; then tilix --working-directory=\"{0}\" --command 'opencode'; ",
                "elif command -v alacritty >/dev/null 2>&1; then alacritty --working-directory \"{0}\" -e opencode; ",
                "elif command -v kitty >/dev/null 2>&1; then kitty --directory \"{0}\" opencode; ",
                "elif command -v wezterm >/dev/null 2>&1; then wezterm start --cwd \"{0}\" opencode; ",
                "elif command -v foot >/dev/null 2>&1; then foot --working-directory=\"{0}\" opencode; ",
                "else printf 'No supported terminal app was found in the shell environment.\\n' >&2; exit 127; fi"
            ),
            candidate_display
        )
    } else {
        match preferred_terminal {
            "x-terminal-emulator" => format!(
                "x-terminal-emulator -e 'sh -lc \"cd \\\"{candidate_display}\\\" && exec opencode\"'"
            ),
            "gnome-terminal" => {
                format!("gnome-terminal --working-directory=\"{candidate_display}\" -- opencode")
            }
            "terminator" => {
                format!(
                    "terminator --working-directory=\"{candidate_display}\" --geometry=140x44 -x opencode"
                )
            }
            "ptyxis" => {
                format!("ptyxis --new-window --working-directory \"{candidate_display}\" -- opencode")
            }
            "kgx" => format!("kgx --working-directory=\"{candidate_display}\" opencode"),
            "konsole" => format!("konsole --workdir \"{candidate_display}\" -e opencode"),
            "xfce4-terminal" => {
                format!("xfce4-terminal --working-directory=\"{candidate_display}\" -x opencode")
            }
            "tilix" => format!("tilix --working-directory=\"{candidate_display}\" --command 'opencode'"),
            "alacritty" => format!("alacritty --working-directory \"{candidate_display}\" -e opencode"),
            "kitty" => format!("kitty --directory \"{candidate_display}\" opencode"),
            "wezterm" => format!("wezterm start --cwd \"{candidate_display}\" opencode"),
            "foot" => format!("foot --working-directory=\"{candidate_display}\" opencode"),
            _ => preferred_terminal.to_string(),
        }
    };

    format!(
        concat!(
            "command -v opencode >/dev/null 2>&1 || {{ ",
            "printf 'Opencode CLI command \"opencode\" was not found in the shell environment.\\n' >&2; ",
            "exit 127; ",
            "}}; ",
            "{0}"
        ),
        if preferred_terminal == "auto" {
            launch_command
        } else {
            format!(
                "command -v {0} >/dev/null 2>&1 || {{ printf 'Preferred terminal \\\"{0}\\\" was not found in the shell environment.\\n' >&2; exit 127; }}; {1}",
                preferred_terminal, launch_command
            )
        }
    )
}

#[tauri::command]
pub fn get_app_settings() -> Result<AppSettingsResponse, String> {
    app_settings_response()
}

#[tauri::command]
pub fn update_project_root(project_root: String) -> Result<AppSettingsResponse, String> {
    let candidate = PathBuf::from(project_root.trim());
    let mut settings = load_settings()?;

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

    settings.project_root = canonical.to_string_lossy().into_owned();
    save_settings(&settings)?;

    app_settings_response()
}

#[tauri::command]
pub fn update_preferred_terminal(preferred_terminal: String) -> Result<AppSettingsResponse, String> {
    let mut settings = load_settings()?;
    settings.preferred_terminal = normalize_preferred_terminal(&preferred_terminal)?;
    save_settings(&settings)?;

    app_settings_response()
}

#[tauri::command]
pub fn update_tray_icon(app: AppHandle, tray_icon: String) -> Result<AppSettingsResponse, String> {
    let mut settings = load_settings()?;
    settings.tray_icon = normalize_tray_icon(&tray_icon)?;
    save_settings(&settings)?;

    if let Some(tray) = app.tray_by_id(TRAY_ICON_ID) {
        tray.set_icon(Some(tray_icon_image(
            &settings.tray_icon,
            &settings.app_theme,
        )))
        .map_err(|error| format!("Could not update tray icon: {error}"))?;
    }

    sync_app_menu_icon(&app)?;
    sync_main_window_icon(&app)?;

    app_settings_response()
}

#[tauri::command]
pub fn update_app_theme(app: AppHandle, app_theme: String) -> Result<AppSettingsResponse, String> {
    let mut settings = load_settings()?;
    settings.app_theme = normalize_app_theme(&app_theme)?;
    save_settings(&settings)?;

    if let Some(tray) = app.tray_by_id(TRAY_ICON_ID) {
        tray.set_icon(Some(tray_icon_image(
            &settings.tray_icon,
            &settings.app_theme,
        )))
        .map_err(|error| format!("Could not update tray icon: {error}"))?;
    }

    sync_app_menu_icon(&app)?;
    sync_main_window_icon(&app)?;

    app_settings_response()
}

#[tauri::command]
pub fn update_card_actions(card_actions: Vec<String>) -> Result<AppSettingsResponse, String> {
    let mut settings = load_settings()?;
    settings.card_actions = normalize_card_actions(&card_actions)?;
    save_settings(&settings)?;

    app_settings_response()
}

#[tauri::command]
pub fn update_layout(layout: String) -> Result<AppSettingsResponse, String> {
    let mut settings = load_settings()?;
    settings.layout = normalize_layout(&layout)?;
    save_settings(&settings)?;

    app_settings_response()
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectEntry>, String> {
    let root = crate::settings::configured_project_root()?;
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
            let git_summary = if is_git_repo {
                resolve_git_project_summary(&path).ok()
            } else {
                None
            };
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
                git_branch: git_summary
                    .as_ref()
                    .and_then(|summary| summary.branch.clone()),
                git_common_dir: git_summary
                    .as_ref()
                    .map(|summary| summary.common_dir.clone()),
                git_worktree_count: git_summary.as_ref().map(|summary| summary.worktree_count),
                is_primary_worktree: git_summary
                    .as_ref()
                    .map(|summary| summary.is_primary_worktree),
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
pub fn open_in_code(target_path: String) -> Result<(), String> {
    let candidate = validate_path_within_code_root(&target_path)?;
    let working_directory = if candidate.is_dir() {
        candidate.as_path()
    } else {
        candidate.parent().unwrap_or(candidate.as_path())
    };
    let code_command = concat!(
        "command -v code >/dev/null 2>&1 || { ",
        "printf 'VS Code CLI command \"code\" was not found in the shell environment.\n' >&2; ",
        "exit 127; ",
        "}; ",
        "code --new-window \"$1\""
    );

    shell_command(code_command, Some(&candidate), Some(working_directory))
        .map_err(|error| format!("Could not launch VS Code: {error}"))
}

#[tauri::command]
pub fn open_in_terminal(target_path: String) -> Result<(), String> {
    let candidate = validate_path_within_code_root(&target_path)?;
    let preferred_terminal = load_settings()?.preferred_terminal;
    let terminal_command = terminal_launch_command(&candidate, &preferred_terminal);

    shell_command(&terminal_command, None, Some(&candidate))
        .map_err(|error| format!("Could not launch Terminal: {error}"))
}

#[tauri::command]
pub fn open_in_opencode(target_path: String) -> Result<(), String> {
    let candidate = validate_path_within_code_root(&target_path)?;
    let preferred_terminal = load_settings()?.preferred_terminal;
    let terminal_command = opencode_terminal_command(&candidate, &preferred_terminal);

    shell_command(&terminal_command, None, Some(&candidate))
        .map_err(|error| format!("Could not launch Opencode: {error}"))
}
