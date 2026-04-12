use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

use crate::{
    settings::configured_project_root,
    types::{
        CreateGitWorktreeResult, GitBranchEntry, GitChangedFileEntry, GitCommitDetails,
        GitCommitEntry, GitOverview, GitProjectSummary, GitWorktreeEntry,
        ParsedGitWorktreeRecord, ReleaseNoteEntry,
    },
    workspace::{
        default_workspace_contents, find_workspace, sanitize_project_name,
        validate_new_path_within_code_root, validate_path_within_code_root, workspace_file_path,
    },
};

fn git_command_output(repo_path: &Path, args: &[&str], context: &str) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|error| format!("Could not {context}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!(
                "Git command failed with status {} while trying to {context}",
                output.status
            )
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn resolve_git_project_summary(project_path: &Path) -> Result<GitProjectSummary, String> {
    let branch_output = git_command_output(
        project_path,
        &["branch", "--show-current"],
        "read the current branch",
    )?;
    let common_dir = git_command_output(
        project_path,
        &["rev-parse", "--git-common-dir"],
        "read the git common directory",
    )?;
    let common_dir_path = project_path.join(common_dir.trim());
    let canonical_common_dir = fs::canonicalize(&common_dir_path)
        .map_err(|error| format!("Could not access {}: {error}", common_dir_path.display()))?;
    let main_worktree_dir = canonical_common_dir
        .parent()
        .and_then(|parent| parent.parent())
        .ok_or_else(|| {
            format!(
                "Could not determine the primary worktree for {}.",
                project_path.display()
            )
        })?;
    let canonical_project_path = fs::canonicalize(project_path)
        .map_err(|error| format!("Could not access {}: {error}", project_path.display()))?;
    let root = configured_project_root()?;
    let worktree_count = parse_git_worktree_records(project_path)?
        .into_iter()
        .filter_map(|record| canonicalize_existing_worktree_path(&record.path).ok())
        .filter(|path| path.starts_with(&root))
        .count();

    Ok(GitProjectSummary {
        branch: if branch_output.is_empty() {
            None
        } else {
            Some(branch_output)
        },
        common_dir: canonical_common_dir.to_string_lossy().into_owned(),
        worktree_count,
        is_primary_worktree: canonical_project_path == main_worktree_dir,
    })
}

fn canonicalize_existing_worktree_path(path: &str) -> Result<PathBuf, String> {
    let worktree_path = PathBuf::from(path);

    if !worktree_path.exists() {
        return Err(format!("{} does not exist.", worktree_path.display()));
    }

    fs::canonicalize(&worktree_path)
        .map_err(|error| format!("Could not access {}: {error}", worktree_path.display()))
}

fn worktree_display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("worktree")
        .to_string()
}

fn parse_git_worktree_records(project_path: &Path) -> Result<Vec<ParsedGitWorktreeRecord>, String> {
    let output = git_command_output(
        project_path,
        &["worktree", "list", "--porcelain"],
        "read git worktrees",
    )?;
    let mut records = Vec::new();
    let mut current = ParsedGitWorktreeRecord::default();

    for line in output.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            if !current.path.is_empty() {
                records.push(current);
                current = ParsedGitWorktreeRecord::default();
            }

            continue;
        }

        if let Some(value) = trimmed.strip_prefix("worktree ") {
            current.path = value.trim().to_string();
        } else if let Some(value) = trimmed.strip_prefix("branch refs/heads/") {
            current.branch = Some(value.trim().to_string());
        } else if trimmed == "HEAD" {
            current.is_detached = true;
        } else if trimmed == "detached" {
            current.is_detached = true;
        } else if trimmed == "bare" {
            current.is_bare = true;
        } else if trimmed == "locked" {
            current.is_locked = true;
        } else if trimmed.starts_with("locked ") {
            current.is_locked = true;
        } else if trimmed == "prunable" {
            current.is_prunable = true;
        } else if trimmed.starts_with("prunable ") {
            current.is_prunable = true;
        }
    }

    if !current.path.is_empty() {
        records.push(current);
    }

    if let Some(first) = records.first_mut() {
        first.is_primary = true;
    }

    Ok(records)
}

fn git_worktree_dirty_state(project_path: &Path) -> Result<bool, String> {
    let output = git_command_output(project_path, &["status", "--porcelain"], "read git status")?;
    Ok(!output.is_empty())
}

#[tauri::command]
pub fn get_git_history(
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
pub fn list_git_branches(project_path: String) -> Result<Vec<GitBranchEntry>, String> {
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
pub fn get_git_overview(project_path: String) -> Result<GitOverview, String> {
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
    let changed_files = list_git_changed_files(&candidate)?;

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
        changed_files,
    })
}

#[tauri::command]
pub fn list_git_worktrees(project_path: String) -> Result<Vec<GitWorktreeEntry>, String> {
    let candidate = validate_path_within_code_root(&project_path)?;

    if !candidate.join(".git").exists() {
        return Err(format!("{} is not a git repository", candidate.display()));
    }

    let current_path = fs::canonicalize(&candidate)
        .map_err(|error| format!("Could not access {}: {error}", candidate.display()))?;
    let root = configured_project_root()?;
    let records = parse_git_worktree_records(&candidate)?;
    let mut worktrees = Vec::new();

    for record in records {
        let parsed_path = PathBuf::from(&record.path);
        let display_path = parsed_path.to_string_lossy().into_owned();
        let display_name = worktree_display_name(&parsed_path);

        match canonicalize_existing_worktree_path(&record.path) {
            Ok(canonical_worktree_path) => {
                if !canonical_worktree_path.starts_with(&root) {
                    continue;
                }

                let workspace_path = find_workspace(&canonical_worktree_path);
                let has_workspace = workspace_path.is_some();
                let is_current = canonical_worktree_path == current_path;
                let is_dirty = git_worktree_dirty_state(&canonical_worktree_path)?;

                worktrees.push(GitWorktreeEntry {
                    name: display_name,
                    path: canonical_worktree_path.to_string_lossy().into_owned(),
                    display_path,
                    workspace_path: workspace_path.map(|path| path.to_string_lossy().into_owned()),
                    has_workspace,
                    branch: record.branch,
                    is_current,
                    is_primary: record.is_primary,
                    is_detached: record.is_detached,
                    is_locked: record.is_locked,
                    is_prunable: record.is_prunable,
                    is_bare: record.is_bare,
                    is_dirty,
                    is_stale: false,
                });
            }
            Err(_) => {
                if !parsed_path.starts_with(&root) {
                    continue;
                }

                worktrees.push(GitWorktreeEntry {
                    name: display_name,
                    path: display_path.clone(),
                    display_path,
                    workspace_path: None,
                    has_workspace: false,
                    branch: record.branch,
                    is_current: false,
                    is_primary: record.is_primary,
                    is_detached: record.is_detached,
                    is_locked: record.is_locked,
                    is_prunable: true,
                    is_bare: record.is_bare,
                    is_dirty: false,
                    is_stale: true,
                });
            }
        }
    }

    worktrees.sort_by(|left, right| {
        left.is_stale
            .cmp(&right.is_stale)
            .then_with(|| right.is_primary.cmp(&left.is_primary))
            .then_with(|| right.is_current.cmp(&left.is_current))
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(worktrees)
}

#[tauri::command]
pub fn prune_git_worktrees(project_path: String) -> Result<(), String> {
    let candidate = validate_path_within_code_root(&project_path)?;

    if !candidate.join(".git").exists() {
        return Err(format!("{} is not a git repository", candidate.display()));
    }

    let output = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .arg("worktree")
        .arg("prune")
        .arg("--verbose")
        .output()
        .map_err(|error| format!("Could not prune git worktrees: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git worktree prune failed with status {}", output.status)
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
pub fn create_git_worktree(
    source_project_path: String,
    branch_name: String,
) -> Result<CreateGitWorktreeResult, String> {
    let candidate = validate_path_within_code_root(&source_project_path)?;

    if !candidate.join(".git").exists() {
        return Err(format!("{} is not a git repository", candidate.display()));
    }

    let branch_name = sanitize_project_name(&branch_name);
    if branch_name.is_empty() {
        return Err("Branch name must include letters or numbers.".to_string());
    }

    let repo_name = candidate
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("Could not determine a name for {}.", candidate.display()))?;
    let default_folder_name = format!("{}-{}", sanitize_project_name(repo_name), branch_name);
    let worktree_path = validate_new_path_within_code_root(&default_folder_name)?;
    let worktree_path_display = worktree_path.to_string_lossy().into_owned();

    let output = Command::new("git")
        .arg("-C")
        .arg(&candidate)
        .arg("worktree")
        .arg("add")
        .arg("-b")
        .arg(&branch_name)
        .arg(&worktree_path)
        .output()
        .map_err(|error| format!("Could not create git worktree: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git worktree add failed with status {}", output.status)
        } else {
            stderr
        });
    }

    let workspace_path = if find_workspace(&worktree_path).is_some() {
        find_workspace(&worktree_path).map(|path| path.to_string_lossy().into_owned())
    } else {
        let workspace_path = workspace_file_path(&worktree_path)?;
        fs::write(&workspace_path, default_workspace_contents()).map_err(|error| {
            format!(
                "Could not write default workspace {}: {error}",
                workspace_path.display()
            )
        })?;
        Some(workspace_path.to_string_lossy().into_owned())
    };

    Ok(CreateGitWorktreeResult {
        project_path: worktree_path_display,
        workspace_path,
        branch: branch_name,
    })
}

fn list_git_changed_files(candidate: &Path) -> Result<Vec<GitChangedFileEntry>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(candidate)
        .arg("status")
        .arg("--porcelain")
        .arg("-z")
        .arg("--untracked-files=all")
        .output()
        .map_err(|error| format!("Could not list changed git files: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git status failed with status {}", output.status)
        } else {
            stderr
        });
    }

    let mut changed_files = Vec::new();
    let mut records = output.stdout.split(|byte| *byte == b'\0');

    while let Some(record) = records.next() {
        if record.is_empty() || record.len() < 4 {
            continue;
        }

        let status = &record[..2];
        let path = String::from_utf8_lossy(&record[3..]).to_string();

        if status.contains(&b'R') || status.contains(&b'C') {
            let _ = records.next();
        }

        if status == b"??" {
            changed_files.push(GitChangedFileEntry {
                path,
                status: "untracked".to_string(),
                badge: "??".to_string(),
            });

            continue;
        }

        if let Some(code) = status
            .first()
            .copied()
            .filter(|code| *code != b' ' && *code != b'?')
        {
            changed_files.push(GitChangedFileEntry {
                path: path.clone(),
                status: "staged".to_string(),
                badge: char::from(code).to_string(),
            });
        }

        if let Some(code) = status.get(1).copied().filter(|code| *code != b' ') {
            changed_files.push(GitChangedFileEntry {
                path,
                status: "modified".to_string(),
                badge: char::from(code).to_string(),
            });
        }
    }

    changed_files.sort_by(|left, right| {
        left.status
            .cmp(&right.status)
            .then_with(|| left.path.cmp(&right.path))
    });

    Ok(changed_files)
}

#[tauri::command]
pub fn get_git_commit_details(
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

#[tauri::command]
pub fn get_release_notes() -> Result<Vec<ReleaseNoteEntry>, String> {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "Could not resolve repository root.".to_string())?
        .to_path_buf();

    let tags_output = Command::new("git")
        .arg("-C")
        .arg(&repo_root)
        .arg("tag")
        .arg("--list")
        .arg("v*")
        .arg("--sort=-version:refname")
        .output()
        .map_err(|error| format!("Could not read git tags: {error}"))?;

    if !tags_output.status.success() {
        let stderr = String::from_utf8_lossy(&tags_output.stderr)
            .trim()
            .to_string();
        return Err(if stderr.is_empty() {
            format!("Git tag failed with status {}", tags_output.status)
        } else {
            stderr
        });
    }

    let tags = String::from_utf8_lossy(&tags_output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    let mut entries = Vec::new();

    for (index, tag) in tags.iter().enumerate() {
        let range = if let Some(previous_tag) = tags.get(index + 1) {
            format!("{previous_tag}..{tag}")
        } else {
            tag.clone()
        };

        let log_output = Command::new("git")
            .arg("-C")
            .arg(&repo_root)
            .arg("log")
            .arg(&range)
            .arg("--no-merges")
            .arg("--pretty=format:%s")
            .output()
            .map_err(|error| format!("Could not read release history for {tag}: {error}"))?;

        if !log_output.status.success() {
            let stderr = String::from_utf8_lossy(&log_output.stderr)
                .trim()
                .to_string();
            return Err(if stderr.is_empty() {
                format!("Git log failed with status {} for {tag}", log_output.status)
            } else {
                stderr
            });
        }

        let items = String::from_utf8_lossy(&log_output.stdout)
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();

        entries.push(ReleaseNoteEntry {
            version: tag.trim_start_matches('v').to_string(),
            items,
        });
    }

    Ok(entries)
}
