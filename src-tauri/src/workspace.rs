use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use crate::{settings::configured_project_root, types::CreateProjectWorkspaceResult};

pub fn default_workspace_contents() -> String {
    serde_json::json!({
        "folders": [
            {
                "path": "."
            }
        ],
        "settings": {
            "files.exclude": {
                "**/.git": true,
                "**/.DS_Store": true
            },
            "search.exclude": {
                "**/.git": true
            },
            "files.insertFinalNewline": true,
            "files.trimTrailingWhitespace": true
        }
    })
    .to_string()
}

pub fn sanitize_project_name(value: &str) -> String {
    let mut sanitized = String::new();
    let mut previous_was_separator = false;

    for character in value.trim().chars() {
        let normalized = if character.is_ascii_alphanumeric() {
            character.to_ascii_lowercase()
        } else if matches!(character, '-' | '_' | '.' | '/' | ' ') {
            '-'
        } else {
            continue;
        };

        if normalized == '-' {
            if previous_was_separator {
                continue;
            }

            previous_was_separator = true;
            sanitized.push(normalized);
        } else {
            previous_was_separator = false;
            sanitized.push(normalized);
        }
    }

    sanitized.trim_matches('-').to_string()
}

pub fn workspace_file_path(project_path: &Path) -> Result<PathBuf, String> {
    let project_name = project_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            format!(
                "Could not determine a workspace name for {}.",
                project_path.display()
            )
        })?;

    Ok(project_path.join(format!("{project_name}.code-workspace")))
}

pub fn validate_new_path_within_code_root(target_path: &str) -> Result<PathBuf, String> {
    let root = configured_project_root()?;
    let candidate = PathBuf::from(target_path.trim());

    if candidate.as_os_str().is_empty() {
        return Err("Target path cannot be empty.".to_string());
    }

    if candidate.exists() {
        return Err(format!("{} already exists.", candidate.display()));
    }

    if candidate.is_absolute() {
        if !candidate.starts_with(&root) {
            return Err(format!(
                "Refused to create {} because it is outside {}",
                candidate.display(),
                root.display()
            ));
        }

        let parent = candidate.parent().ok_or_else(|| {
            format!(
                "Could not determine the parent directory for {}.",
                candidate.display()
            )
        })?;
        let canonical_parent = fs::canonicalize(parent)
            .map_err(|error| format!("Could not access {}: {error}", parent.display()))?;

        if !canonical_parent.starts_with(&root) {
            return Err(format!(
                "Refused to create {} because it is outside {}",
                candidate.display(),
                root.display()
            ));
        }

        return Ok(candidate);
    }

    let mut normalized = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::Normal(value) => normalized.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err("Target path must stay inside the configured project root.".to_string())
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err("Target path cannot be empty.".to_string());
    }

    let absolute_candidate = root.join(normalized);
    let parent = absolute_candidate.parent().ok_or_else(|| {
        format!(
            "Could not determine the parent directory for {}.",
            absolute_candidate.display()
        )
    })?;

    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Could not access {}: {error}", parent.display()))?;

    if !canonical_parent.starts_with(&root) {
        return Err(format!(
            "Refused to create {} because it is outside {}",
            absolute_candidate.display(),
            root.display()
        ));
    }

    Ok(absolute_candidate)
}

pub fn find_workspace(project_path: &Path) -> Option<PathBuf> {
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

pub fn detect_tech_tags(project_path: &Path) -> Vec<String> {
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

pub fn validate_path_within_code_root(target_path: &str) -> Result<PathBuf, String> {
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

fn archive_directory_for_root(root: &Path) -> Result<PathBuf, String> {
    let parent = root.parent().ok_or_else(|| {
        format!(
            "Could not determine an archive directory for {}.",
            root.display()
        )
    })?;

    Ok(parent.join("archive"))
}

fn validate_project_path_for_archive(target_path: &str) -> Result<PathBuf, String> {
    let candidate = validate_path_within_code_root(target_path)?;

    if !candidate.is_dir() {
        return Err(format!("{} is not a project folder.", candidate.display()));
    }

    let root = configured_project_root()?;
    let parent = candidate.parent().ok_or_else(|| {
        format!(
            "Could not determine the parent directory for {}.",
            candidate.display()
        )
    })?;

    if parent != root {
        return Err(format!(
            "Refused to archive {} because it is not a direct child of {}",
            candidate.display(),
            root.display()
        ));
    }

    Ok(candidate)
}

#[tauri::command]
pub fn create_default_workspace(project_path: String) -> Result<String, String> {
    let candidate = validate_path_within_code_root(&project_path)?;

    if !candidate.is_dir() {
        return Err(format!("{} is not a project folder.", candidate.display()));
    }

    if let Some(existing_workspace) = find_workspace(&candidate) {
        return Err(format!(
            "A workspace already exists for {} at {}.",
            candidate.display(),
            existing_workspace.display()
        ));
    }

    let workspace_path = workspace_file_path(&candidate)?;

    fs::write(&workspace_path, default_workspace_contents()).map_err(|error| {
        format!(
            "Could not write default workspace {}: {error}",
            workspace_path.display()
        )
    })?;

    Ok(workspace_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_project_workspace(project_name: String) -> Result<CreateProjectWorkspaceResult, String> {
    let sanitized_name = sanitize_project_name(&project_name);

    if sanitized_name.is_empty() {
        return Err("Project name must include letters or numbers.".to_string());
    }

    let project_path = validate_new_path_within_code_root(&sanitized_name)?;
    fs::create_dir_all(&project_path)
        .map_err(|error| format!("Could not create {}: {error}", project_path.display()))?;

    let workspace_path = workspace_file_path(&project_path)?;
    fs::write(&workspace_path, default_workspace_contents()).map_err(|error| {
        format!(
            "Could not write default workspace {}: {error}",
            workspace_path.display()
        )
    })?;

    Ok(CreateProjectWorkspaceResult {
        project_path: project_path.to_string_lossy().into_owned(),
        workspace_path: workspace_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn archive_project(project_path: String) -> Result<String, String> {
    let candidate = validate_project_path_for_archive(&project_path)?;
    let root = configured_project_root()?;
    let archive_dir = archive_directory_for_root(&root)?;
    fs::create_dir_all(&archive_dir)
        .map_err(|error| format!("Could not create {}: {error}", archive_dir.display()))?;

    let project_name = candidate.file_name().ok_or_else(|| {
        format!(
            "Could not determine the folder name for {}.",
            candidate.display()
        )
    })?;
    let archive_target = archive_dir.join(project_name);

    if archive_target.exists() {
        return Err(format!(
            "Archive target {} already exists.",
            archive_target.display()
        ));
    }

    fs::rename(&candidate, &archive_target).map_err(|error| {
        format!(
            "Could not archive {} to {}: {error}",
            candidate.display(),
            archive_target.display()
        )
    })?;

    Ok(archive_target.to_string_lossy().into_owned())
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
