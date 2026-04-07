import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import packageJson from "../package.json";
import {
  type AppSettings,
  type AppTheme,
  type CardActionName,
  type ColorSchemeMode,
  type CreateGitWorktreeResult,
  type CreateProjectWorkspaceResult,
  type GitBranchEntry,
  type GitCommitDetails,
  type GitCommitEntry,
  type GitOverview,
  type GitWorktreeEntry,
  type LayoutName,
  type Project,
  type ReleaseNoteEntry,
  type TrayIconName,
  type ViewMode,
} from "./types";
import { createCommandCenter } from "./ui/command-center";
import { createCreateFlowController } from "./ui/create-flow";
import { createGitHistoryPanel } from "./ui/git-history";
import { createProjectCard } from "./ui/project-card";
import { createProjectsPanel } from "./ui/projects-panel";
import { createSettingsPanel } from "./ui/settings-panel";

const VIEW_STORAGE_KEY = "project-dashboard-view-mode";
const TRAY_HINT_DISMISSED_KEY = "project-dashboard-hide-tray-hint";
const COLOR_SCHEME_STORAGE_KEY = "project-dashboard-theme";
const FALLBACK_APP_VERSION = packageJson.version;
const TRAY_ICON_OPTIONS = [
  {
    name: "grid",
    label: "Grid",
    description: "Balanced dashboard tiles.",
  },
  {
    name: "orbit",
    label: "Orbit",
    description: "Circular motion around a hub.",
  },
  {
    name: "stacks",
    label: "Stacks",
    description: "Layered project lines.",
  },
] as const satisfies ReadonlyArray<{
  name: TrayIconName;
  label: string;
  description: string;
}>;

const APP_THEME_OPTIONS = [
  { name: "default", label: "Default" },
  { name: "neon", label: "Neon" },
  { name: "ember", label: "Ember" },
  { name: "fjord", label: "Fjord" },
  { name: "signal", label: "Signal" },
] as const satisfies ReadonlyArray<{
  name: string;
  label: string;
}>;

const CARD_ACTION_OPTIONS = [
  {
    name: "workspace",
    label: "VS Code Workspace",
    description: "Open the saved workspace in VS Code when available.",
  },
  {
    name: "folder",
    label: "VS Code Folder",
    description: "Open the project folder in VS Code.",
  },
  {
    name: "terminal",
    label: "Terminal",
    description: "Open the project folder in your preferred terminal.",
  },
  {
    name: "opencode",
    label: "Opencode",
    description: "Open the project folder in Opencode.",
  },
  {
    name: "git",
    label: "Git History",
    description: "Open recent git history for repositories.",
  },
  {
    name: "none",
    label: "None",
    description: "Leave this footer slot empty.",
  },
] as const satisfies ReadonlyArray<{
  name: CardActionName;
  label: string;
  description: string;
}>;

const state = {
  projects: [] as Project[],
  settings: null as AppSettings | null,
  query: "",
  openingPath: "",
  creatingWorkspacePath: "",
  creatingProjectWorkspace: false,
  creatingGitWorktree: false,
  pruningGitWorktrees: false,
  terminalPath: "",
  opencodePath: "",
  viewMode: loadViewMode(),
  colorSchemeMode: loadColorSchemeMode(),
  appTheme: "neon" as AppTheme,
  activeHistoryPath: "",
  activeHistoryBranch: "",
  activeHistoryProjectName: "",
  activeWorktrees: [] as GitWorktreeEntry[],
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

let searchInputEl: HTMLInputElement;
let projectGridEl: HTMLElement;
let projectCountEl: HTMLElement;
let workspaceCountEl: HTMLElement;
let appVersionEl: HTMLButtonElement;
let appBrandIconEl: HTMLElement;
let statusEl: HTMLElement;
let refreshButtonEl: HTMLButtonElement;
let settingsButtonEl: HTMLButtonElement;
let toolbarAppIconEl: HTMLElement;
let projectRootDisplayEl: HTMLElement;
let viewDetailedButtonEl: HTMLButtonElement;
let viewCompactButtonEl: HTMLButtonElement;
let historyModalEl: HTMLDialogElement;
let historyCloseButtonEl: HTMLButtonElement;
let historyProjectNameEl: HTMLElement;
let historyOverviewEl: HTMLElement;
let historyStatusEl: HTMLElement;
let historyListEl: HTMLElement;
let historyBranchSelectEl: HTMLSelectElement;
let createProjectWorkspaceButtonEl: HTMLButtonElement;
let createWorktreeButtonEl: HTMLButtonElement;
let pruneWorktreesButtonEl: HTMLButtonElement;
let worktreeListEl: HTMLElement;
let staleWorktreeSectionEl: HTMLElement;
let staleWorktreeListEl: HTMLElement;
let historyChangesEl: HTMLElement;
let createProjectWorkspaceModalEl: HTMLDialogElement;
let createProjectWorkspaceCloseButtonEl: HTMLButtonElement;
let createProjectWorkspaceFormEl: HTMLFormElement;
let createProjectWorkspaceNameEl: HTMLInputElement;
let createProjectWorkspaceStatusEl: HTMLElement;
let createWorktreeModalEl: HTMLDialogElement;
let createWorktreeCloseButtonEl: HTMLButtonElement;
let createWorktreeFormEl: HTMLFormElement;
let createWorktreeBranchNameEl: HTMLInputElement;
let createWorktreePathPreviewEl: HTMLElement;
let createWorktreeStatusEl: HTMLElement;
let commitModalEl: HTMLDialogElement;
let commitCloseButtonEl: HTMLButtonElement;
let commitSubjectEl: HTMLElement;
let commitMetaEl: HTMLElement;
let commitBodyEl: HTMLElement;
let trayHintModalEl: HTMLDialogElement;
let trayHintCloseButtonEl: HTMLButtonElement;
let trayHintDismissCheckboxEl: HTMLInputElement;
let releaseNotesModalEl: HTMLDialogElement;
let releaseNotesCloseButtonEl: HTMLButtonElement;
let releaseNotesTitleEl: HTMLElement;
let releaseNotesListEl: HTMLElement;
let settingsModalEl: HTMLDialogElement;
let settingsCloseButtonEl: HTMLButtonElement;
let settingsFormEl: HTMLFormElement;
let projectRootInputEl: HTMLInputElement;
let projectRootBrowseEl: HTMLButtonElement;
let projectRootDefaultEl: HTMLElement;
let preferredTerminalSelectEl: HTMLSelectElement;
let trayIconOptionsEl: HTMLElement;
let cardActionSelectEls: HTMLSelectElement[] = [];
let layoutButtonEls: HTMLButtonElement[] = [];
let settingsStatusEl: HTMLElement;
let projectRootResetEl: HTMLButtonElement;
let appThemeButtonEls: HTMLButtonElement[] = [];
let colorSchemeLightButtonEl: HTMLButtonElement;
let colorSchemeDarkButtonEl: HTMLButtonElement;
let colorSchemeSystemButtonEl: HTMLButtonElement;
let systemThemeMediaQuery: MediaQueryList | null = null;
let commandCenter: ReturnType<typeof createCommandCenter>;
let createFlowController: ReturnType<typeof createCreateFlowController>;
let settingsPanel: ReturnType<typeof createSettingsPanel>;
let gitHistoryPanel: ReturnType<typeof createGitHistoryPanel>;
let projectsPanel: ReturnType<typeof createProjectsPanel>;

async function initializeApp() {
  void fetchAppVersion();
  await fetchSettings();
  await fetchProjects();
}

async function fetchAppVersion() {
  setAppVersion(FALLBACK_APP_VERSION);

  try {
    setAppVersion(await getVersion());
  } catch {
    setAppVersion(FALLBACK_APP_VERSION);
  }
}

function setAppVersion(version: string) {
  appVersionEl.textContent = `Version ${version}`;
}

function renderReleaseNotes(entries: ReleaseNoteEntry[]) {
  releaseNotesListEl.innerHTML = "";

  if (entries.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "release-notes-empty";
    emptyState.textContent = "No tagged releases found yet.";
    releaseNotesListEl.append(emptyState);
    return;
  }

  for (const entry of entries) {
    const section = document.createElement("section");
    section.className = "release-note-section";

    const heading = document.createElement("h3");
    heading.className = "release-note-version";
    heading.textContent = `v${entry.version}`;

    const list = document.createElement("ul");
    list.className = "release-note-items";

    if (entry.items.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.textContent = "No commit subjects found for this release.";
      list.append(emptyItem);
    } else {
      for (const itemText of entry.items) {
        const item = document.createElement("li");
        item.textContent = itemText;
        list.append(item);
      }
    }

    section.append(heading, list);
    releaseNotesListEl.append(section);
  }
}

async function loadReleaseNotes() {
  releaseNotesListEl.innerHTML = "";

  const loadingState = document.createElement("p");
  loadingState.className = "release-notes-empty";
  loadingState.textContent = "Loading release notes...";
  releaseNotesListEl.append(loadingState);

  try {
    const entries = await invoke<ReleaseNoteEntry[]>("get_release_notes");
    renderReleaseNotes(entries);
  } catch (error) {
    releaseNotesListEl.innerHTML = "";
    const errorState = document.createElement("p");
    errorState.className = "release-notes-empty";
    errorState.textContent = `Could not load release notes: ${String(error)}`;
    releaseNotesListEl.append(errorState);
  }
}

async function fetchSettings() {
  try {
    state.settings = await invoke<AppSettings>("get_app_settings");
    syncSettingsUi();
  } catch (error) {
    setStatus(`Could not load settings: ${String(error)}`, true);
  }
}

function syncSettingsUi() {
  settingsPanel.sync(state.settings, state.appTheme);
}

async function fetchProjects() {
  setStatus("Scanning your project folder...");
  refreshButtonEl.disabled = true;

  try {
    state.projects = await invoke<Project[]>("list_projects");
    renderProjects();
    const projectRoot = state.settings?.projectRoot ?? "your configured root";
    setStatus(`Loaded ${state.projects.length} projects from ${projectRoot}.`);
  } catch (error) {
    projectsPanel.renderLoadError(String(error));
    setStatus("Project scan failed.", true);
  } finally {
    refreshButtonEl.disabled = false;
  }
}

function renderProjects() {
  const filteredProjects = getFilteredProjects();
  projectsPanel.renderProjects(filteredProjects, state.projects, state.viewMode, (project) => createProjectCard(project, {
      cardActions: state.settings?.cardActions ?? [],
      dateFormatter,
      openInCode,
      openInTerminal,
      openInOpencode,
      openGitHistory,
      createDefaultWorkspace,
    }));

  syncBusyButtons();
}

function getFilteredProjects() {
  const query = state.query.trim().toLowerCase();

  if (!query) {
    return state.projects;
  }

  return state.projects.filter((project) => {
    const searchTarget = [project.name, project.path, project.workspacePath ?? ""]
      .join(" ")
      .toLowerCase();
    return searchTarget.includes(query);
  });
}

async function openGitHistory(project: Project) {
  state.activeHistoryPath = project.path;
  state.activeHistoryProjectName = project.name;
  gitHistoryPanel.prepare(project.name);

  try {
    const [branches, overview, worktrees] = await Promise.all([
      invoke<GitBranchEntry[]>("list_git_branches", { projectPath: project.path }),
      invoke<GitOverview>("get_git_overview", { projectPath: project.path }),
      invoke<GitWorktreeEntry[]>("list_git_worktrees", { projectPath: project.path }),
    ]);

    gitHistoryPanel.renderBranchOptions(branches);
    gitHistoryPanel.renderOverview(overview);
    gitHistoryPanel.renderWorktrees(worktrees, state.pruningGitWorktrees);

    const currentBranch = overview.currentBranch || branches.find((branch) => branch.isCurrent)?.name || branches[0]?.name || "HEAD";
    state.activeHistoryBranch = currentBranch;
    gitHistoryPanel.selectBranch(currentBranch);

    await loadGitHistory(project.path, currentBranch);
  } catch (error) {
    gitHistoryPanel.setStatus(String(error), true);
    historyBranchSelectEl.disabled = true;
    worktreeListEl.innerHTML = "";
  }
}

async function loadGitHistory(projectPath: string, branchName: string) {
  gitHistoryPanel.setStatus(`Loading commits from ${branchName}...`);
  historyListEl.innerHTML = "";

  try {
    const commits = await invoke<GitCommitEntry[]>("get_git_history", { projectPath, branchName });
    gitHistoryPanel.renderHistory(commits);
    gitHistoryPanel.setStatus(commits.length > 0
      ? `Showing ${commits.length} recent commits from ${branchName}.`
      : `No commits found on ${branchName}.`);
  } catch (error) {
    gitHistoryPanel.setStatus(String(error), true);
  }
}

async function openCommitDetails(commitRef: string) {
  if (!state.activeHistoryPath) {
    return;
  }

  gitHistoryPanel.openCommitLoading();

  try {
    const details = await invoke<GitCommitDetails>("get_git_commit_details", {
      projectPath: state.activeHistoryPath,
      commitRef,
    });

    gitHistoryPanel.renderCommitDetails(details);
  } catch (error) {
    gitHistoryPanel.renderCommitError(String(error));
  }
}

function loadViewMode(): ViewMode {
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return stored === "compact" ? "compact" : "detailed";
}

function setViewMode(viewMode: ViewMode) {
  state.viewMode = viewMode;
  window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  renderProjects();
}

function loadColorSchemeMode(): ColorSchemeMode {
  const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
}

function isAppTheme(value: string | null): value is AppTheme {
  return APP_THEME_OPTIONS.some((option) => option.name === value);
}

function getResolvedColorSchemeMode() {
  if (state.colorSchemeMode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return state.colorSchemeMode;
}

function applyColorSchemeMode() {
  const resolvedColorSchemeMode = getResolvedColorSchemeMode();
  document.documentElement.dataset.theme = resolvedColorSchemeMode;
  document.documentElement.style.colorScheme = resolvedColorSchemeMode;
  settingsPanel.syncColorScheme(state.colorSchemeMode, resolvedColorSchemeMode);
}

function setColorSchemeMode(colorSchemeMode: ColorSchemeMode) {
  state.colorSchemeMode = colorSchemeMode;
  window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, state.colorSchemeMode);
  applyColorSchemeMode();
}

async function saveAppTheme(appTheme: AppTheme) {
  setSettingsStatus("Saving app theme...");

  try {
    state.settings = await invoke<AppSettings>("update_app_theme", { appTheme });
    syncSettingsUi();
    setSettingsStatus("App theme updated.");
  } catch (error) {
    setSettingsStatus(String(error), true);
  }
}

function syncSystemThemeListener() {
  if (systemThemeMediaQuery) {
    systemThemeMediaQuery.removeEventListener("change", applyColorSchemeMode);
  }

  systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeMediaQuery.addEventListener("change", applyColorSchemeMode);
}

async function openInCode(targetPath: string, message: string) {
  await commandCenter.openInCode(targetPath, message);
}

async function openInTerminal(targetPath: string, message: string) {
  await commandCenter.openInTerminal(targetPath, message);
}

async function openInOpencode(targetPath: string, message: string) {
  await commandCenter.openInOpencode(targetPath, message);
}

async function createDefaultWorkspace(project: Project) {
  await commandCenter.createDefaultWorkspace(project);
}

async function submitCreateProjectWorkspace() {
  const projectName = createFlowController.getProjectWorkspaceName();

  if (!projectName) {
    createFlowController.setProjectWorkspaceStatus("Enter a project name first.", true);
    return;
  }

  state.creatingProjectWorkspace = true;
  syncBusyButtons();
  createFlowController.setProjectWorkspaceStatus("Creating project workspace...");

  try {
    const result = await invoke<CreateProjectWorkspaceResult>("create_project_workspace", { projectName });
    await fetchProjects();
    createFlowController.closeProjectWorkspaceModal();
    setStatus(`Created ${result.projectPath} with a default workspace.`);
    await openInCode(result.workspacePath, `Opened ${projectName} workspace in VS Code.`);
  } catch (error) {
    createFlowController.setProjectWorkspaceStatus(String(error), true);
  } finally {
    state.creatingProjectWorkspace = false;
    syncBusyButtons();
  }
}

async function submitCreateWorktree() {
  const branchName = createFlowController.getWorktreeBranchName();

  if (!state.activeHistoryPath) {
    createFlowController.setWorktreeStatus("Open a repository first.", true);
    return;
  }

  if (!branchName) {
    createFlowController.setWorktreeStatus("Enter a branch name first.", true);
    return;
  }

  state.creatingGitWorktree = true;
  syncBusyButtons();
  createFlowController.setWorktreeStatus("Creating git worktree...");

  try {
    const result = await invoke<CreateGitWorktreeResult>("create_git_worktree", {
      sourceProjectPath: state.activeHistoryPath,
      branchName,
    });
    await fetchProjects();
    const activeProject = state.projects.find((project) => project.path === state.activeHistoryPath);
    if (activeProject) {
      await openGitHistory(activeProject);
    }
    createFlowController.closeWorktreeModal();
    setStatus(`Created ${result.branch} worktree at ${result.projectPath}.`);
    if (result.workspacePath) {
      await openInCode(result.workspacePath, `Opened ${result.branch} workspace in VS Code.`);
    }
  } catch (error) {
    createFlowController.setWorktreeStatus(String(error), true);
  } finally {
    state.creatingGitWorktree = false;
    syncBusyButtons();
  }
}

async function pruneGitWorktrees() {
  if (!state.activeHistoryPath) {
    return;
  }

  state.pruningGitWorktrees = true;
  syncBusyButtons();
  historyStatusEl.dataset.state = "default";
  historyStatusEl.textContent = "Pruning stale worktrees...";

  try {
    await invoke("prune_git_worktrees", { projectPath: state.activeHistoryPath });
    const activeProject = state.projects.find((project) => project.path === state.activeHistoryPath);
    await fetchProjects();
    if (activeProject) {
      const refreshedProject = state.projects.find((project) => project.path === activeProject.path) ?? activeProject;
      await openGitHistory(refreshedProject);
    }
    setStatus("Pruned stale git worktrees.");
  } catch (error) {
    historyStatusEl.dataset.state = "error";
    historyStatusEl.textContent = String(error);
  } finally {
    state.pruningGitWorktrees = false;
    syncBusyButtons();
  }
}

function syncBusyButtons() {
  commandCenter.syncBusyButtons();
}

function setStatus(message: string, isError = false) {
  commandCenter.setStatus(message, isError);
}

function setSettingsStatus(message: string, isError = false) {
  settingsPanel.setStatus(message, isError);
}

async function saveCardActions(cardActions: CardActionName[]) {
  setSettingsStatus("Saving project card actions...");

  try {
    state.settings = await invoke<AppSettings>("update_card_actions", { cardActions });
    syncSettingsUi();
    renderProjects();
    setSettingsStatus("Project card actions updated.");
  } catch (error) {
    setSettingsStatus(String(error), true);
  }
}

async function saveLayout(layout: LayoutName) {
  setSettingsStatus("Saving layout...");

  try {
    state.settings = await invoke<AppSettings>("update_layout", { layout });
    syncSettingsUi();
    setSettingsStatus("Layout updated.");
  } catch (error) {
    setSettingsStatus(String(error), true);
  }
}

function shouldShowTrayHint() {
  return window.localStorage.getItem(TRAY_HINT_DISMISSED_KEY) !== "true";
}

function openTrayHint() {
  if (!shouldShowTrayHint() || trayHintModalEl.open) {
    return;
  }

  trayHintDismissCheckboxEl.checked = false;
  trayHintModalEl.showModal();
}

function closeTrayHint() {
  if (trayHintDismissCheckboxEl.checked) {
    window.localStorage.setItem(TRAY_HINT_DISMISSED_KEY, "true");
  }

  trayHintModalEl.close();
}

function openReleaseNotes() {
  releaseNotesTitleEl.textContent = `Project Dashboard ${appVersionEl.textContent?.replace(/^Version\s+/, "v") ?? "updates"}`;
  document.body.classList.add("modal-open");
  releaseNotesModalEl.showModal();
}

function openSettings() {
  settingsPanel.open(state.settings, state.appTheme);
}

async function saveProjectRoot(projectRoot: string) {
  setSettingsStatus("Saving project root...");

  try {
    state.settings = await invoke<AppSettings>("update_project_root", { projectRoot });
    syncSettingsUi();
    setSettingsStatus("Project root updated.");
    await fetchProjects();
  } catch (error) {
    setSettingsStatus(String(error), true);
  }
}

async function savePreferredTerminal(preferredTerminal: string) {
  setSettingsStatus("Saving preferred terminal...");

  try {
    state.settings = await invoke<AppSettings>("update_preferred_terminal", { preferredTerminal });
    syncSettingsUi();
    setSettingsStatus("Preferred terminal updated.");
  } catch (error) {
    setSettingsStatus(String(error), true);
  }
}

async function saveTrayIcon(trayIcon: TrayIconName) {
  setSettingsStatus("Saving tray icon...");

  try {
    state.settings = await invoke<AppSettings>("update_tray_icon", { trayIcon });
    syncSettingsUi();
    setSettingsStatus("Tray icon updated.");
  } catch (error) {
    setSettingsStatus(String(error), true);
  }
}

async function browseProjectRoot() {
  const defaultPath = projectRootInputEl.value.trim() || state.settings?.projectRoot || state.settings?.defaultProjectRoot;

  try {
    const selection = await open({
      defaultPath,
      directory: true,
      multiple: false,
      title: "Choose projects folder",
    });

    if (typeof selection !== "string") {
      return;
    }

    projectRootInputEl.value = selection;
    setSettingsStatus(`Selected ${selection}`);
  } catch (error) {
    setSettingsStatus(`Could not browse for a folder: ${String(error)}`, true);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  searchInputEl = document.querySelector("#search-input") as HTMLInputElement;
  projectGridEl = document.querySelector("#project-grid") as HTMLElement;
  projectCountEl = document.querySelector("#project-count") as HTMLElement;
  workspaceCountEl = document.querySelector("#workspace-count") as HTMLElement;
  appVersionEl = document.querySelector("#app-version") as HTMLButtonElement;
  appBrandIconEl = document.querySelector("#app-brand-icon") as HTMLElement;
  statusEl = document.querySelector("#status-message") as HTMLElement;
  refreshButtonEl = document.querySelector("#refresh-button") as HTMLButtonElement;
  settingsButtonEl = document.querySelector("#settings-button") as HTMLButtonElement;
  toolbarAppIconEl = document.querySelector("#toolbar-app-icon") as HTMLElement;
  projectRootDisplayEl = document.querySelector("#project-root-display") as HTMLElement;
  viewDetailedButtonEl = document.querySelector("#view-detailed") as HTMLButtonElement;
  viewCompactButtonEl = document.querySelector("#view-compact") as HTMLButtonElement;
  historyModalEl = document.querySelector("#history-modal") as HTMLDialogElement;
  historyCloseButtonEl = document.querySelector("#history-close") as HTMLButtonElement;
  historyProjectNameEl = document.querySelector("#history-project-name") as HTMLElement;
  historyOverviewEl = document.querySelector("#history-overview") as HTMLElement;
  historyStatusEl = document.querySelector("#history-status") as HTMLElement;
  historyListEl = document.querySelector("#history-list") as HTMLElement;
  historyBranchSelectEl = document.querySelector("#history-branch-select") as HTMLSelectElement;
  createProjectWorkspaceButtonEl = document.querySelector("#create-project-workspace-button") as HTMLButtonElement;
  createWorktreeButtonEl = document.querySelector("#create-worktree-button") as HTMLButtonElement;
  pruneWorktreesButtonEl = document.querySelector("#prune-worktrees-button") as HTMLButtonElement;
  worktreeListEl = document.querySelector("#worktree-list") as HTMLElement;
  staleWorktreeSectionEl = document.querySelector("#stale-worktree-section") as HTMLElement;
  staleWorktreeListEl = document.querySelector("#stale-worktree-list") as HTMLElement;
  historyChangesEl = document.querySelector("#history-changes") as HTMLElement;
  createProjectWorkspaceModalEl = document.querySelector("#create-project-workspace-modal") as HTMLDialogElement;
  createProjectWorkspaceCloseButtonEl = document.querySelector("#create-project-workspace-close") as HTMLButtonElement;
  createProjectWorkspaceFormEl = document.querySelector("#create-project-workspace-form") as HTMLFormElement;
  createProjectWorkspaceNameEl = document.querySelector("#create-project-workspace-name") as HTMLInputElement;
  createProjectWorkspaceStatusEl = document.querySelector("#create-project-workspace-status") as HTMLElement;
  createWorktreeModalEl = document.querySelector("#create-worktree-modal") as HTMLDialogElement;
  createWorktreeCloseButtonEl = document.querySelector("#create-worktree-close") as HTMLButtonElement;
  createWorktreeFormEl = document.querySelector("#create-worktree-form") as HTMLFormElement;
  createWorktreeBranchNameEl = document.querySelector("#create-worktree-branch-name") as HTMLInputElement;
  createWorktreePathPreviewEl = document.querySelector("#create-worktree-path-preview") as HTMLElement;
  createWorktreeStatusEl = document.querySelector("#create-worktree-status") as HTMLElement;
  commitModalEl = document.querySelector("#commit-modal") as HTMLDialogElement;
  commitCloseButtonEl = document.querySelector("#commit-close") as HTMLButtonElement;
  commitSubjectEl = document.querySelector("#commit-subject") as HTMLElement;
  commitMetaEl = document.querySelector("#commit-meta") as HTMLElement;
  commitBodyEl = document.querySelector("#commit-body") as HTMLElement;
  trayHintModalEl = document.querySelector("#tray-hint-modal") as HTMLDialogElement;
  trayHintCloseButtonEl = document.querySelector("#tray-hint-close") as HTMLButtonElement;
  trayHintDismissCheckboxEl = document.querySelector("#tray-hint-dismiss") as HTMLInputElement;
  releaseNotesModalEl = document.querySelector("#release-notes-modal") as HTMLDialogElement;
  releaseNotesCloseButtonEl = document.querySelector("#release-notes-close") as HTMLButtonElement;
  releaseNotesTitleEl = document.querySelector("#release-notes-title") as HTMLElement;
  releaseNotesListEl = document.querySelector("#release-notes-list") as HTMLElement;
  settingsModalEl = document.querySelector("#settings-modal") as HTMLDialogElement;
  settingsCloseButtonEl = document.querySelector("#settings-close") as HTMLButtonElement;
  settingsFormEl = document.querySelector("#settings-form") as HTMLFormElement;
  projectRootInputEl = document.querySelector("#project-root-input") as HTMLInputElement;
  projectRootBrowseEl = document.querySelector("#project-root-browse") as HTMLButtonElement;
  projectRootDefaultEl = document.querySelector("#project-root-default") as HTMLElement;
  preferredTerminalSelectEl = document.querySelector("#preferred-terminal-select") as HTMLSelectElement;
  trayIconOptionsEl = document.querySelector("#tray-icon-options") as HTMLElement;
  cardActionSelectEls = Array.from(document.querySelectorAll("[data-card-action-slot]")) as HTMLSelectElement[];
  layoutButtonEls = Array.from(document.querySelectorAll("[data-layout-option]")) as HTMLButtonElement[];
  settingsStatusEl = document.querySelector("#settings-status") as HTMLElement;
  projectRootResetEl = document.querySelector("#project-root-reset") as HTMLButtonElement;
  appThemeButtonEls = Array.from(document.querySelectorAll("[data-app-theme-option]")) as HTMLButtonElement[];
  colorSchemeLightButtonEl = document.querySelector("#theme-light") as HTMLButtonElement;
  colorSchemeDarkButtonEl = document.querySelector("#theme-dark") as HTMLButtonElement;
  colorSchemeSystemButtonEl = document.querySelector("#theme-system") as HTMLButtonElement;

  commandCenter = createCommandCenter({
    status: statusEl,
    getBusyState: () => ({
      openingPath: state.openingPath,
      creatingWorkspacePath: state.creatingWorkspacePath,
      creatingProjectWorkspace: state.creatingProjectWorkspace,
      creatingGitWorktree: state.creatingGitWorktree,
      pruningGitWorktrees: state.pruningGitWorktrees,
      terminalPath: state.terminalPath,
      opencodePath: state.opencodePath,
    }),
    patchBusyState: (patch) => {
      Object.assign(state, patch);
    },
    invokeCommand: async (command, args) => await invoke(command, args),
    refreshProjects: fetchProjects,
  });

  createFlowController = createCreateFlowController({
    createProjectWorkspaceModal: createProjectWorkspaceModalEl,
    createProjectWorkspaceName: createProjectWorkspaceNameEl,
    createProjectWorkspaceStatus: createProjectWorkspaceStatusEl,
    createWorktreeModal: createWorktreeModalEl,
    createWorktreeBranchName: createWorktreeBranchNameEl,
    createWorktreePathPreview: createWorktreePathPreviewEl,
    createWorktreeStatus: createWorktreeStatusEl,
  });

  projectsPanel = createProjectsPanel({
    projectGrid: projectGridEl,
    projectCount: projectCountEl,
    workspaceCount: workspaceCountEl,
    viewDetailedButton: viewDetailedButtonEl,
    viewCompactButton: viewCompactButtonEl,
  });

  settingsPanel = createSettingsPanel({
    appBrandIcon: appBrandIconEl,
    toolbarAppIcon: toolbarAppIconEl,
    projectRootDisplay: projectRootDisplayEl,
    projectRootInput: projectRootInputEl,
    projectRootDefault: projectRootDefaultEl,
    preferredTerminalSelect: preferredTerminalSelectEl,
    trayIconOptions: trayIconOptionsEl,
    cardActionSelects: cardActionSelectEls,
    layoutButtons: layoutButtonEls,
    settingsStatus: settingsStatusEl,
    projectRootReset: projectRootResetEl,
    appThemeButtons: appThemeButtonEls,
    colorSchemeLightButton: colorSchemeLightButtonEl,
    colorSchemeDarkButton: colorSchemeDarkButtonEl,
    colorSchemeSystemButton: colorSchemeSystemButtonEl,
    settingsModal: settingsModalEl,
  }, {
    trayIconOptions: TRAY_ICON_OPTIONS,
    onTrayIconSelect: saveTrayIcon,
  });

  gitHistoryPanel = createGitHistoryPanel({
    historyModal: historyModalEl,
    historyProjectName: historyProjectNameEl,
    historyOverview: historyOverviewEl,
    historyStatus: historyStatusEl,
    historyList: historyListEl,
    historyBranchSelect: historyBranchSelectEl,
    createWorktreeButton: createWorktreeButtonEl,
    pruneWorktreesButton: pruneWorktreesButtonEl,
    worktreeList: worktreeListEl,
    staleWorktreeSection: staleWorktreeSectionEl,
    staleWorktreeList: staleWorktreeListEl,
    historyChanges: historyChangesEl,
    commitModal: commitModalEl,
    commitSubject: commitSubjectEl,
    commitMeta: commitMetaEl,
    commitBody: commitBodyEl,
  }, {
    onOpenWorktree: async (worktree) => {
      if (worktree.workspacePath) {
        await openInCode(worktree.workspacePath, `Opened ${worktree.name} workspace in VS Code.`);
      } else {
        await openInCode(worktree.path, `Opened ${worktree.name} in VS Code.`);
      }
    },
    onOpenCommitDetails: async (commitRef) => {
      await openCommitDetails(commitRef);
    },
  });

  searchInputEl.addEventListener("input", (event) => {
    state.query = (event.target as HTMLInputElement).value;
    renderProjects();
  });

  refreshButtonEl.addEventListener("click", async () => {
    await fetchProjects();
  });

  settingsButtonEl.addEventListener("click", () => {
    openSettings();
  });

  appVersionEl.addEventListener("click", () => {
    openReleaseNotes();
  });

  settingsCloseButtonEl.addEventListener("click", () => {
    settingsModalEl.close();
  });

  settingsFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProjectRoot(projectRootInputEl.value);
  });

  projectRootBrowseEl.addEventListener("click", async () => {
    await browseProjectRoot();
  });

  preferredTerminalSelectEl.addEventListener("change", async (event) => {
    await savePreferredTerminal((event.target as HTMLSelectElement).value);
  });

  for (const select of cardActionSelectEls) {
    select.addEventListener("change", async () => {
      const cardActions = cardActionSelectEls.map((element) => {
        const value = element.value;
        return isCardActionName(value) ? value : "none";
      });
      await saveCardActions(cardActions);
    });
  }

  for (const button of appThemeButtonEls) {
    button.addEventListener("click", async () => {
      const nextTheme = button.dataset.appThemeValue ?? null;

      if (isAppTheme(nextTheme)) {
        await saveAppTheme(nextTheme);
      }
    });
  }

  for (const button of layoutButtonEls) {
    button.addEventListener("click", async () => {
      const nextLayout = button.dataset.layoutValue;

      if (isLayoutName(nextLayout)) {
        await saveLayout(nextLayout);
      }
    });
  }

  colorSchemeLightButtonEl.addEventListener("click", () => {
    setColorSchemeMode("light");
  });

  colorSchemeDarkButtonEl.addEventListener("click", () => {
    setColorSchemeMode("dark");
  });

  colorSchemeSystemButtonEl.addEventListener("click", () => {
    setColorSchemeMode("system");
  });

  projectRootResetEl.addEventListener("click", async () => {
    if (!state.settings) {
      return;
    }

    projectRootInputEl.value = state.settings.defaultProjectRoot;
    await saveProjectRoot(state.settings.defaultProjectRoot);
  });

  viewDetailedButtonEl.addEventListener("click", () => {
    setViewMode("detailed");
  });

  viewCompactButtonEl.addEventListener("click", () => {
    setViewMode("compact");
  });

  historyCloseButtonEl.addEventListener("click", () => {
    historyModalEl.close();
  });

  historyBranchSelectEl.addEventListener("change", async (event) => {
    const branchName = (event.target as HTMLSelectElement).value;
    state.activeHistoryBranch = branchName;

    if (state.activeHistoryPath) {
      await loadGitHistory(state.activeHistoryPath, branchName);
    }
  });

  createProjectWorkspaceButtonEl.addEventListener("click", () => {
    createFlowController.openProjectWorkspaceModal();
  });

  createWorktreeButtonEl.addEventListener("click", () => {
    const activeProject = state.projects.find((project) => project.path === state.activeHistoryPath);
    createFlowController.openWorktreeModal(activeProject?.name ?? "project");
  });

  pruneWorktreesButtonEl.addEventListener("click", async () => {
    await pruneGitWorktrees();
  });

  createProjectWorkspaceCloseButtonEl.addEventListener("click", () => {
    createFlowController.closeProjectWorkspaceModal();
  });

  createWorktreeCloseButtonEl.addEventListener("click", () => {
    createFlowController.closeWorktreeModal();
  });

  createProjectWorkspaceFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitCreateProjectWorkspace();
  });

  createWorktreeFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitCreateWorktree();
  });

  createWorktreeBranchNameEl.addEventListener("input", () => {
    const activeProject = state.projects.find((project) => project.path === state.activeHistoryPath);
    createFlowController.updateWorktreePreview(activeProject?.name ?? "project");
  });

  historyModalEl.addEventListener("close", () => {
    state.activeHistoryPath = "";
    state.activeHistoryProjectName = "";
    state.activeHistoryBranch = "";
    state.activeWorktrees = [];
    gitHistoryPanel.reset();
  });

  commitCloseButtonEl.addEventListener("click", () => {
    commitModalEl.close();
  });

  trayHintCloseButtonEl.addEventListener("click", () => {
    closeTrayHint();
  });

  releaseNotesCloseButtonEl.addEventListener("click", () => {
    releaseNotesModalEl.close();
  });

  releaseNotesModalEl.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
  });

  void listen("tray://refresh-projects", async () => {
    await fetchProjects();
  });

  if (shouldShowTrayHint()) {
    window.setTimeout(() => {
      openTrayHint();
    }, 500);
  }

  void loadReleaseNotes();
  syncSystemThemeListener();
  applyColorSchemeMode();
  void initializeApp();
});

function isCardActionName(value: string): value is CardActionName {
  return CARD_ACTION_OPTIONS.some((option) => option.name === value);
}

function isLayoutName(value: string | undefined): value is LayoutName {
  return value === "standard" || value === "sidebar-dock";
}
