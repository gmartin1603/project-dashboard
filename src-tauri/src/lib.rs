use tauri::{
    menu::{IconMenuItem, Menu},
    WindowEvent,
};

mod types;
mod settings;
mod workspace;
mod git;
mod tray;
mod commands;

use commands::{
    get_app_settings, list_projects, open_in_code, open_in_opencode, open_in_terminal,
    update_app_theme, update_card_actions, update_layout, update_preferred_terminal,
    update_project_root, update_tray_icon,
};
use types::*;
use git::{
    create_git_worktree, get_git_commit_details, get_git_history, get_git_overview,
    get_release_notes, list_git_branches, list_git_worktrees, prune_git_worktrees,
};
use tray::{build_tray, current_tray_icon_image, sync_app_menu_icon, sync_main_window_icon};
use workspace::{archive_project, create_default_workspace, create_project_workspace};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .menu(|app| {
            Menu::with_id_and_items(
                app,
                APP_MENU_ID,
                &[&IconMenuItem::with_id(
                    app,
                    APP_MENU_SHOW_ID,
                    "Show Project Dashboard",
                    true,
                    Some(current_tray_icon_image()),
                    None::<&str>,
                )?],
            )
        })
        .setup(|app| {
            let _tray = build_tray(app.handle())?;
            let _ = sync_app_menu_icon(app.handle());
            let _ = sync_main_window_icon(app.handle());
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
            update_preferred_terminal,
            update_tray_icon,
            update_card_actions,
            update_layout,
            update_app_theme,
            list_projects,
            archive_project,
            open_in_code,
            open_in_terminal,
            open_in_opencode,
            create_default_workspace,
            create_project_workspace,
            get_git_history,
            list_git_branches,
            get_git_overview,
            list_git_worktrees,
            create_git_worktree,
            prune_git_worktrees,
            get_git_commit_details,
            get_release_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
