import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Project = {
  name: string;
  path: string;
  workspacePath: string | null;
  hasWorkspace: boolean;
  isGitRepo: boolean;
  lastModifiedEpochMs: number | null;
  techTags: string[];
};

type AppSettings = {
  projectRoot: string;
  defaultProjectRoot: string;
};

type GitCommitEntry = {
  shortHash: string;
  subject: string;
  relativeTime: string;
};

type GitBranchEntry = {
  name: string;
  isCurrent: boolean;
};

type GitOverview = {
  currentBranch: string;
  upstreamBranch: string | null;
  aheadCount: number;
  behindCount: number;
  isDirty: boolean;
};

type GitCommitDetails = {
  shortHash: string;
  fullHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authoredRelativeTime: string;
};

type ViewMode = "detailed" | "compact";
type IconName = "workspace" | "folder" | "git";
type TechIconName =
  | "node"
  | "bun"
  | "pnpm"
  | "yarn"
  | "deno"
  | "rust"
  | "python"
  | "go"
  | "php"
  | "ruby"
  | "dart"
  | "java"
  | "cpp"
  | "dotnet";

const VIEW_STORAGE_KEY = "project-dashboard-view-mode";
const TRAY_HINT_DISMISSED_KEY = "project-dashboard-hide-tray-hint";

const state = {
  projects: [] as Project[],
  settings: null as AppSettings | null,
  query: "",
  openingPath: "",
  viewMode: loadViewMode(),
  activeHistoryPath: "",
  activeHistoryBranch: "",
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
let statusEl: HTMLElement;
let refreshButtonEl: HTMLButtonElement;
let settingsButtonEl: HTMLButtonElement;
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
let commitModalEl: HTMLDialogElement;
let commitCloseButtonEl: HTMLButtonElement;
let commitSubjectEl: HTMLElement;
let commitMetaEl: HTMLElement;
let commitBodyEl: HTMLElement;
let trayHintModalEl: HTMLDialogElement;
let trayHintCloseButtonEl: HTMLButtonElement;
let trayHintDismissCheckboxEl: HTMLInputElement;
let settingsModalEl: HTMLDialogElement;
let settingsCloseButtonEl: HTMLButtonElement;
let settingsFormEl: HTMLFormElement;
let projectRootInputEl: HTMLInputElement;
let projectRootDefaultEl: HTMLElement;
let settingsStatusEl: HTMLElement;
let projectRootResetEl: HTMLButtonElement;

async function initializeApp() {
  await fetchSettings();
  await fetchProjects();
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
  if (!state.settings) {
    return;
  }

  projectRootDisplayEl.textContent = state.settings.projectRoot;
  projectRootInputEl.value = state.settings.projectRoot;
  projectRootDefaultEl.textContent = `Default root: ${state.settings.defaultProjectRoot}`;
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
    projectGridEl.innerHTML = "";
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `
      <p class="empty-eyebrow">Could not load projects</p>
      <h2>Check the configured project root.</h2>
      <p>${String(error)}</p>
    `;
    projectGridEl.append(emptyState);
    setStatus("Project scan failed.", true);
  } finally {
    refreshButtonEl.disabled = false;
  }
}

function renderProjects() {
  const filteredProjects = getFilteredProjects();
  projectGridEl.innerHTML = "";
  projectGridEl.dataset.viewMode = state.viewMode;
  projectCountEl.textContent = `${filteredProjects.length} visible`;
  workspaceCountEl.textContent = `${state.projects.filter((project) => project.hasWorkspace).length} with workspaces`;
  syncViewToggle();

  if (filteredProjects.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `
      <p class="empty-eyebrow">No matches</p>
      <h2>Try a different project name or update the configured root.</h2>
      <p>Your search checks names, folders, and workspace files.</p>
    `;
    projectGridEl.append(emptyState);
    return;
  }

  for (const project of filteredProjects) {
    projectGridEl.append(createProjectCard(project));
  }
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

function createProjectCard(project: Project) {
  const card = document.createElement("article");
  card.className = "project-card";

  const identity = document.createElement("div");
  identity.className = "project-identity";

  const titleRow = document.createElement("div");
  titleRow.className = "project-title-row";

  const projectIcon = document.createElement("div");
  projectIcon.className = "project-icon";
  projectIcon.append(createIcon(project.workspacePath ? "workspace" : "folder"));

  const header = document.createElement("div");
  header.className = "project-card-header";

  const status = document.createElement("div");
  status.className = "status-row";
  status.append(createBadge(project.hasWorkspace ? "Workspace ready" : "Folder only", project.hasWorkspace ? "workspace" : "folder"));

  if (project.isGitRepo) {
    status.append(createBadge("Git repo", "git"));
  }

  const title = document.createElement("h3");
  title.textContent = project.name;
  title.className = "project-title";

  const path = document.createElement("p");
  path.className = "project-path";
  path.textContent = project.path;

  titleRow.append(projectIcon, title);
  identity.append(titleRow, path);
  header.append(identity, status);

  const detailsPanel = document.createElement("div");
  detailsPanel.className = "project-details";

  const detailsLabel = document.createElement("p");
  detailsLabel.className = "detail-label";
  detailsLabel.textContent = project.workspacePath ? "Workspace" : "Project Folder";

  const detailsHeader = document.createElement("div");
  detailsHeader.className = "detail-header";
  detailsHeader.append(createIcon(project.workspacePath ? "workspace" : "folder", "detail-icon"), detailsLabel);

  const detailValue = document.createElement("p");
  detailValue.className = "project-detail-value";
  detailValue.textContent = project.workspacePath ?? project.path;

  if (project.techTags.length > 0) {
    detailsPanel.append(createTechStrip(project.techTags));
  }

  const footer = document.createElement("div");
  footer.className = "project-footer";

  const footerMeta = document.createElement("div");
  footerMeta.className = "footer-meta";

  const modified = document.createElement("p");
  modified.className = "project-modified";
  modified.textContent = project.lastModifiedEpochMs
    ? `Updated ${dateFormatter.format(project.lastModifiedEpochMs)}`
    : "Modified time unavailable";

  detailsPanel.prepend(detailsHeader, detailValue);

  const actions = document.createElement("div");
  actions.className = "project-actions";

  const utilityActions = document.createElement("div");
  utilityActions.className = "utility-actions";

  if (project.isGitRepo) {
    const gitButton = document.createElement("button");
    gitButton.type = "button";
    gitButton.className = "icon-pill icon-pill-git";
    gitButton.setAttribute("aria-label", `View git history for ${project.name}`);
    gitButton.title = "View git history";
    gitButton.append(createIcon("git", "badge-icon"));
    gitButton.addEventListener("click", async () => {
      await openGitHistory(project);
    });
    utilityActions.append(gitButton);
  }

  footerMeta.append(modified, utilityActions);

  const openFolderButton = createActionButton(project.workspacePath ? "Open Folder" : "Open Project", async () => {
    await openInCode(project.path, `Opened ${project.name} in VS Code.`);
  }, false, "folder");

  if (project.workspacePath) {
    const openWorkspaceButton = createActionButton("Open Workspace", async () => {
      await openInCode(project.workspacePath as string, `Opened ${project.name} workspace in VS Code.`);
    }, false, "workspace");
    openWorkspaceButton.classList.add("button-secondary");
    actions.append(openWorkspaceButton, openFolderButton);
  } else {
    actions.append(openFolderButton);
  }

  footer.append(footerMeta, actions);
  card.append(header, detailsPanel, footer);
  return card;
}

function createTechStrip(tags: string[]) {
  const techStrip = document.createElement("div");
  techStrip.className = "tech-strip";

  for (const tag of tags.slice(0, 4)) {
    techStrip.append(createTechBadge(tag as TechIconName));
  }

  return techStrip;
}

function createTechBadge(tag: TechIconName) {
  const chip = document.createElement("span");
  chip.className = `tech-chip tech-${tag}`;
  chip.append(createTechIcon(tag));
  chip.title = formatTechLabel(tag);
  chip.setAttribute("aria-label", formatTechLabel(tag));
  return chip;
}

function createBadge(label: string, variant: IconName) {
  const badge = document.createElement("span");
  badge.className = `badge badge-${variant}`;
  badge.append(createIcon(variant, "badge-icon"));
  badge.title = label;
  badge.setAttribute("aria-label", label);
  return badge;
}

function createActionButton(label: string, onClick: () => Promise<void>, initiallyDisabled = false, icon?: IconName) {
  const button = document.createElement("button");
  button.type = "button";
  if (icon) {
    button.append(createIcon(icon, "button-icon"));
  }
  button.append(label);
  button.dataset.baseDisabled = String(initiallyDisabled);
  button.disabled = initiallyDisabled;
  button.addEventListener("click", async () => {
    await onClick();
  });
  return button;
}

function createIcon(name: IconName, className = "icon") {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("class", className);

  const paths = getIconPaths(name);
  for (const description of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", description.tag);
    for (const [key, value] of Object.entries(description.attributes)) {
      path.setAttribute(key, value);
    }
    icon.append(path);
  }

  return icon;
}

function createTechIcon(name: TechIconName) {
  const icon = document.createElement("span");
  icon.className = `tech-icon tech-icon-${name}`;
  icon.textContent = getTechGlyph(name);
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function getIconPaths(name: IconName) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": "1.75",
  };

  switch (name) {
    case "workspace":
      return [
        { tag: "rect", attributes: { ...common, x: "3", y: "4", width: "18", height: "16", rx: "3" } },
        { tag: "path", attributes: { ...common, d: "M8 9h8" } },
        { tag: "path", attributes: { ...common, d: "M8 13h3" } },
        { tag: "path", attributes: { ...common, d: "M14.5 12.5l1.5 1.5 2.5-3" } },
      ];
    case "git":
      return [
        { tag: "path", attributes: { ...common, d: "M12 3 4 11l8 8 8-8-8-8Z" } },
        { tag: "circle", attributes: { ...common, cx: "9", cy: "9", r: "1.25" } },
        { tag: "circle", attributes: { ...common, cx: "15", cy: "15", r: "1.25" } },
        { tag: "path", attributes: { ...common, d: "M10 10v4" } },
        { tag: "path", attributes: { ...common, d: "M10 10l4 4" } },
      ];
    case "folder":
    default:
      return [
        { tag: "path", attributes: { ...common, d: "M3.5 8.5A2.5 2.5 0 0 1 6 6h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5V16A2.5 2.5 0 0 1 18 18.5H6A2.5 2.5 0 0 1 3.5 16Z" } },
      ];
  }
}

function getTechGlyph(name: TechIconName) {
  switch (name) {
    case "node": return "N";
    case "bun": return "B";
    case "pnpm": return "P";
    case "yarn": return "Y";
    case "deno": return "D";
    case "rust": return "R";
    case "python": return "Py";
    case "go": return "Go";
    case "php": return "Php";
    case "ruby": return "Rb";
    case "dart": return "Dt";
    case "java": return "Jv";
    case "cpp": return "C++";
    case "dotnet": return ".N";
  }
}

function formatTechLabel(tag: TechIconName) {
  switch (tag) {
    case "dotnet":
      return ".NET";
    case "cpp":
      return "C++";
    default:
      return tag.charAt(0).toUpperCase() + tag.slice(1);
  }
}

async function openGitHistory(project: Project) {
  state.activeHistoryPath = project.path;
  historyProjectNameEl.textContent = `${project.name} commits`;
  historyStatusEl.textContent = "Loading branches...";
  historyListEl.innerHTML = "";
  historyOverviewEl.textContent = "";
  historyBranchSelectEl.disabled = true;
  historyBranchSelectEl.innerHTML = "";

  if (!historyModalEl.open) {
    document.body.classList.add("modal-open");
    historyModalEl.showModal();
  }

  try {
    const [branches, overview] = await Promise.all([
      invoke<GitBranchEntry[]>("list_git_branches", { projectPath: project.path }),
      invoke<GitOverview>("get_git_overview", { projectPath: project.path }),
    ]);

    renderBranchOptions(branches);
    renderGitOverview(overview);

    const currentBranch = overview.currentBranch || branches.find((branch) => branch.isCurrent)?.name || branches[0]?.name || "HEAD";
    state.activeHistoryBranch = currentBranch;
    historyBranchSelectEl.value = currentBranch;

    await loadGitHistory(project.path, currentBranch);
  } catch (error) {
    historyStatusEl.textContent = String(error);
    historyStatusEl.dataset.state = "error";
    historyBranchSelectEl.disabled = true;
  }
}

function renderBranchOptions(branches: GitBranchEntry[]) {
  historyBranchSelectEl.innerHTML = "";

  if (branches.length === 0) {
    const option = document.createElement("option");
    option.value = "HEAD";
    option.textContent = "No local branches found";
    historyBranchSelectEl.append(option);
    historyBranchSelectEl.disabled = true;
    return;
  }

  for (const branch of branches) {
    const option = document.createElement("option");
    option.value = branch.name;
    option.textContent = branch.isCurrent ? `${branch.name} (current)` : branch.name;
    historyBranchSelectEl.append(option);
  }

  historyBranchSelectEl.disabled = false;
}

function renderGitOverview(overview: GitOverview) {
  const upstream = overview.upstreamBranch ? `Upstream ${overview.upstreamBranch}` : "No upstream";
  const sync = overview.upstreamBranch ? `Ahead ${overview.aheadCount} / Behind ${overview.behindCount}` : "Local only";
  const dirty = overview.isDirty ? "Dirty" : "Clean";
  historyOverviewEl.textContent = `${overview.currentBranch} - ${upstream} - ${sync} - ${dirty}`;
}

async function loadGitHistory(projectPath: string, branchName: string) {
  historyStatusEl.dataset.state = "default";
  historyStatusEl.textContent = `Loading commits from ${branchName}...`;
  historyListEl.innerHTML = "";

  try {
    const commits = await invoke<GitCommitEntry[]>("get_git_history", { projectPath, branchName });
    renderGitHistory(commits);
    historyStatusEl.textContent = commits.length > 0
      ? `Showing ${commits.length} recent commits from ${branchName}.`
      : `No commits found on ${branchName}.`;
  } catch (error) {
    historyStatusEl.textContent = String(error);
    historyStatusEl.dataset.state = "error";
  }
}

function renderGitHistory(commits: GitCommitEntry[]) {
  historyListEl.innerHTML = "";
  historyStatusEl.dataset.state = "default";

  if (commits.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "history-empty";
    emptyState.textContent = "No git commits were returned for this repository.";
    historyListEl.append(emptyState);
    return;
  }

  for (const commit of commits) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "history-item";

    const hash = document.createElement("span");
    hash.className = "history-hash";
    hash.textContent = commit.shortHash;

    const subject = document.createElement("p");
    subject.className = "history-subject";
    subject.textContent = commit.subject;

    const time = document.createElement("p");
    time.className = "history-time";
    time.textContent = commit.relativeTime;

    item.append(hash, subject, time);
    item.addEventListener("click", async () => {
      await openCommitDetails(commit.shortHash);
    });
    historyListEl.append(item);
  }
}

async function openCommitDetails(commitRef: string) {
  if (!state.activeHistoryPath) {
    return;
  }

  commitSubjectEl.textContent = "Loading commit...";
  commitMetaEl.textContent = "";
  commitBodyEl.textContent = "";

  if (!commitModalEl.open) {
    commitModalEl.showModal();
  }

  try {
    const details = await invoke<GitCommitDetails>("get_git_commit_details", {
      projectPath: state.activeHistoryPath,
      commitRef,
    });

    commitSubjectEl.textContent = details.subject;
    commitMetaEl.textContent = `${details.shortHash} - ${details.authorName} <${details.authorEmail}> - ${details.authoredRelativeTime}`;
    commitBodyEl.textContent = details.body || "No commit body.";
  } catch (error) {
    commitSubjectEl.textContent = "Could not load commit";
    commitMetaEl.textContent = String(error);
    commitBodyEl.textContent = "";
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

function syncViewToggle() {
  const isDetailed = state.viewMode === "detailed";
  viewDetailedButtonEl.classList.toggle("is-active", isDetailed);
  viewCompactButtonEl.classList.toggle("is-active", !isDetailed);
  viewDetailedButtonEl.setAttribute("aria-pressed", String(isDetailed));
  viewCompactButtonEl.setAttribute("aria-pressed", String(!isDetailed));
}

async function openInCode(targetPath: string, message: string) {
  state.openingPath = targetPath;
  syncBusyButtons();
  setStatus(`Launching VS Code for ${targetPath}...`);

  try {
    await invoke("open_in_code", { targetPath });
    setStatus(message);
  } catch (error) {
    setStatus(String(error), true);
  } finally {
    state.openingPath = "";
    syncBusyButtons();
  }
}

function syncBusyButtons() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".project-actions button, #refresh-button");
  const isBusy = state.openingPath.length > 0;

  for (const button of buttons) {
    const baseDisabled = button.dataset.baseDisabled === "true";
    button.disabled = isBusy || baseDisabled;
  }
}

function setStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.dataset.state = isError ? "error" : "default";
}

function setSettingsStatus(message: string, isError = false) {
  settingsStatusEl.textContent = message;
  settingsStatusEl.dataset.state = isError ? "error" : "default";
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

function openSettings() {
  if (!state.settings) {
    return;
  }

  projectRootInputEl.value = state.settings.projectRoot;
  setSettingsStatus("");
  settingsModalEl.showModal();
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

window.addEventListener("DOMContentLoaded", () => {
  searchInputEl = document.querySelector("#search-input") as HTMLInputElement;
  projectGridEl = document.querySelector("#project-grid") as HTMLElement;
  projectCountEl = document.querySelector("#project-count") as HTMLElement;
  workspaceCountEl = document.querySelector("#workspace-count") as HTMLElement;
  statusEl = document.querySelector("#status-message") as HTMLElement;
  refreshButtonEl = document.querySelector("#refresh-button") as HTMLButtonElement;
  settingsButtonEl = document.querySelector("#settings-button") as HTMLButtonElement;
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
  commitModalEl = document.querySelector("#commit-modal") as HTMLDialogElement;
  commitCloseButtonEl = document.querySelector("#commit-close") as HTMLButtonElement;
  commitSubjectEl = document.querySelector("#commit-subject") as HTMLElement;
  commitMetaEl = document.querySelector("#commit-meta") as HTMLElement;
  commitBodyEl = document.querySelector("#commit-body") as HTMLElement;
  trayHintModalEl = document.querySelector("#tray-hint-modal") as HTMLDialogElement;
  trayHintCloseButtonEl = document.querySelector("#tray-hint-close") as HTMLButtonElement;
  trayHintDismissCheckboxEl = document.querySelector("#tray-hint-dismiss") as HTMLInputElement;
  settingsModalEl = document.querySelector("#settings-modal") as HTMLDialogElement;
  settingsCloseButtonEl = document.querySelector("#settings-close") as HTMLButtonElement;
  settingsFormEl = document.querySelector("#settings-form") as HTMLFormElement;
  projectRootInputEl = document.querySelector("#project-root-input") as HTMLInputElement;
  projectRootDefaultEl = document.querySelector("#project-root-default") as HTMLElement;
  settingsStatusEl = document.querySelector("#settings-status") as HTMLElement;
  projectRootResetEl = document.querySelector("#project-root-reset") as HTMLButtonElement;

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

  settingsCloseButtonEl.addEventListener("click", () => {
    settingsModalEl.close();
  });

  settingsFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProjectRoot(projectRootInputEl.value);
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

  historyModalEl.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    state.activeHistoryPath = "";
    state.activeHistoryBranch = "";
    historyOverviewEl.textContent = "";
    historyStatusEl.dataset.state = "default";
    historyStatusEl.textContent = "";
    historyListEl.innerHTML = "";
    historyBranchSelectEl.innerHTML = "";
  });

  commitCloseButtonEl.addEventListener("click", () => {
    commitModalEl.close();
  });

  trayHintCloseButtonEl.addEventListener("click", () => {
    closeTrayHint();
  });

  void listen("tray://refresh-projects", async () => {
    await fetchProjects();
  });

  if (shouldShowTrayHint()) {
    window.setTimeout(() => {
      openTrayHint();
    }, 500);
  }

  void initializeApp();
});
