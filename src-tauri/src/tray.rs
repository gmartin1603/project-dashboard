use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::{
    image::Image,
    menu::{CheckMenuItem, IconMenuItem, Menu, MenuItem, MenuItemKind},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::{
    settings::{default_project_root, load_settings},
    types::{
        default_app_theme, default_card_actions, default_layout, default_preferred_terminal,
        default_tray_icon, StoredSettings, APP_MENU_ID, APP_MENU_SHOW_ID, EVENT_REFRESH_PROJECTS,
        TRAY_ICON_ID, TRAY_ICON_SIZE,
    },
};

const AUTOSTART_DIR_NAME: &str = "autostart";
const DESKTOP_ENTRY_NAME: &str = "project-dashboard.desktop";

fn tray_icon_palette(app_theme: &str) -> ([u8; 4], [u8; 4], [u8; 4]) {
    match app_theme {
        "ember" => (
            [127, 49, 21, 255],
            [255, 248, 240, 255],
            [224, 137, 76, 255],
        ),
        "fjord" => ([20, 52, 74, 255], [246, 252, 255, 255], [89, 217, 221, 255]),
        "signal" => ([31, 35, 48, 255], [255, 249, 242, 255], [243, 200, 84, 255]),
        "default" => (
            [39, 76, 70, 255],
            [243, 247, 244, 255],
            [147, 215, 192, 255],
        ),
        _ => ([17, 24, 39, 255], [253, 242, 248, 255], [0, 210, 255, 255]),
    }
}

fn fill_rect(buffer: &mut [u8], x: usize, y: usize, width: usize, height: usize, color: [u8; 4]) {
    for row in y..(y + height) {
        for col in x..(x + width) {
            let offset = (row * TRAY_ICON_SIZE as usize + col) * 4;
            buffer[offset..offset + 4].copy_from_slice(&color);
        }
    }
}

fn fill_circle(buffer: &mut [u8], center_x: f32, center_y: f32, radius: f32, color: [u8; 4]) {
    let radius_sq = radius * radius;

    for y in 0..TRAY_ICON_SIZE as usize {
        for x in 0..TRAY_ICON_SIZE as usize {
            let dx = x as f32 + 0.5 - center_x;
            let dy = y as f32 + 0.5 - center_y;

            if dx * dx + dy * dy <= radius_sq {
                let offset = (y * TRAY_ICON_SIZE as usize + x) * 4;
                buffer[offset..offset + 4].copy_from_slice(&color);
            }
        }
    }
}

pub fn tray_icon_image(icon_name: &str, app_theme: &str) -> Image<'static> {
    let (base, foreground, accent) = tray_icon_palette(app_theme);
    let mut rgba = vec![0_u8; (TRAY_ICON_SIZE * TRAY_ICON_SIZE * 4) as usize];

    match icon_name {
        "orbit" => {
            fill_circle(&mut rgba, 32.0, 32.0, 24.0, base);
            fill_circle(&mut rgba, 45.0, 25.0, 4.0, foreground);
            fill_circle(&mut rgba, 19.0, 39.0, 4.0, accent);

            for step in 0..64 {
                let t = step as f32 / 63.0;
                let angle = std::f32::consts::PI * (0.15 + 0.85 * t);
                let x = 32.0 + angle.cos() * 13.0;
                let y = 32.0 + angle.sin() * 13.0;
                fill_circle(&mut rgba, x, y, 3.2, accent);
            }

            for step in 0..64 {
                let t = step as f32 / 63.0;
                let angle = std::f32::consts::PI * (1.15 + 0.85 * t);
                let x = 32.0 + angle.cos() * 13.0;
                let y = 32.0 + angle.sin() * 13.0;
                fill_circle(&mut rgba, x, y, 3.2, foreground);
            }
        }
        "stacks" => {
            fill_rect(&mut rgba, 14, 14, 36, 36, base);
            fill_rect(&mut rgba, 23, 22, 18, 4, foreground);
            fill_rect(&mut rgba, 23, 30, 18, 4, accent);
            fill_rect(&mut rgba, 23, 38, 12, 4, foreground);
            fill_rect(&mut rgba, 44, 18, 4, 28, accent);
        }
        _ => {
            fill_rect(&mut rgba, 10, 10, 44, 44, base);
            fill_rect(&mut rgba, 18, 18, 10, 10, foreground);
            fill_rect(&mut rgba, 36, 18, 10, 10, accent);
            fill_rect(&mut rgba, 18, 36, 10, 10, accent);
            fill_rect(&mut rgba, 36, 36, 10, 10, foreground);
        }
    }

    Image::new_owned(rgba, TRAY_ICON_SIZE, TRAY_ICON_SIZE)
}

pub fn current_tray_icon_image() -> Image<'static> {
    let settings = load_settings().unwrap_or_else(|_| StoredSettings {
        project_root: default_project_root().to_string_lossy().into_owned(),
        preferred_terminal: default_preferred_terminal(),
        tray_icon: default_tray_icon(),
        card_actions: default_card_actions(),
        layout: default_layout(),
        app_theme: default_app_theme(),
    });
    tray_icon_image(&settings.tray_icon, &settings.app_theme)
}

pub fn sync_app_menu_icon(app: &AppHandle) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };

    let Some(item) = menu.get(APP_MENU_SHOW_ID) else {
        return Ok(());
    };

    let MenuItemKind::Icon(icon_item) = item else {
        return Ok(());
    };

    icon_item
        .set_icon(Some(current_tray_icon_image()))
        .map_err(|error| format!("Could not update menu icon: {error}"))
}

pub fn sync_main_window_icon(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    window
        .set_icon(current_tray_icon_image())
        .map_err(|error| format!("Could not update window icon: {error}"))
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn desktop_entry_contents(binary_path: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Project Dashboard\nExec={}\nIcon=project-dashboard\nTerminal=false\nCategories=Development;Utility;\nStartupNotify=true\n",
        binary_path.display()
    )
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

pub fn build_tray(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let show_item = IconMenuItem::with_id(
        app,
        APP_MENU_SHOW_ID,
        "Show Project Dashboard",
        true,
        Some(current_tray_icon_image()),
        None::<&str>,
    )?;
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
    let menu = Menu::with_id_and_items(
        app,
        APP_MENU_ID,
        &[&show_item, &refresh_item, &launch_on_login_item, &quit_item],
    )?;
    let tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&menu)
        .icon(current_tray_icon_image())
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

    tray_builder.build(app)
}
