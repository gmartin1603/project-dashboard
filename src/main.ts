import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import packageJson from "../package.json";

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
  preferredTerminal: string;
  trayIcon: TrayIconName;
  cardActions: CardActionName[];
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
type IconName = "workspace" | "folder" | "git" | "terminal" | "opencode";
type TrayIconName = "grid" | "orbit" | "stacks";
type CardActionName = "workspace" | "folder" | "terminal" | "opencode" | "git" | "none";
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
const COLOR_SCHEME_STORAGE_KEY = "project-dashboard-theme";
const APP_THEME_STORAGE_KEY = "project-dashboard-app-theme";
const FALLBACK_APP_VERSION = packageJson.version;
const TRAY_ICON_OPTIONS = [
  {
    name: "grid",
    label: "Grid",
    description: "Balanced dashboard tiles.",
    previewHref: new URL("./assets/tray-grid.svg", import.meta.url).href,
  },
  {
    name: "orbit",
    label: "Orbit",
    description: "Circular motion around a hub.",
    previewHref: new URL("./assets/tray-orbit.svg", import.meta.url).href,
  },
  {
    name: "stacks",
    label: "Stacks",
    description: "Layered project lines.",
    previewHref: new URL("./assets/tray-stacks.svg", import.meta.url).href,
  },
] as const satisfies ReadonlyArray<{
  name: TrayIconName;
  label: string;
  description: string;
  previewHref: string;
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

type ColorSchemeMode = "light" | "dark" | "system";
type AppTheme = (typeof APP_THEME_OPTIONS)[number]["name"];

type ReleaseNoteEntry = {
  version: string;
  items: string[];
};

const state = {
  projects: [] as Project[],
  settings: null as AppSettings | null,
  query: "",
  openingPath: "",
  creatingWorkspacePath: "",
  terminalPath: "",
  opencodePath: "",
  viewMode: loadViewMode(),
  colorSchemeMode: loadColorSchemeMode(),
  appTheme: loadAppTheme(),
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
let settingsStatusEl: HTMLElement;
let projectRootResetEl: HTMLButtonElement;
let appThemeButtonEls: HTMLButtonElement[] = [];
let colorSchemeLightButtonEl: HTMLButtonElement;
let colorSchemeDarkButtonEl: HTMLButtonElement;
let colorSchemeSystemButtonEl: HTMLButtonElement;
let systemThemeMediaQuery: MediaQueryList | null = null;

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
  if (!state.settings) {
    return;
  }

  projectRootDisplayEl.textContent = state.settings.projectRoot;
  projectRootInputEl.value = state.settings.projectRoot;
  projectRootDefaultEl.textContent = `Default root: ${state.settings.defaultProjectRoot}`;
  preferredTerminalSelectEl.value = state.settings.preferredTerminal;
  syncCardActionSelects();
  syncTrayIconToggle();
}

function syncCardActionSelects() {
  const selectedActions = state.settings?.cardActions ?? [];

  for (const [index, select] of cardActionSelectEls.entries()) {
    select.value = selectedActions[index] ?? "none";
  }
}

function renderTrayIconOptions() {
  trayIconOptionsEl.innerHTML = "";

  for (const option of TRAY_ICON_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tray-icon-option";
    button.dataset.trayIcon = option.name;

    const preview = document.createElement("img");
    preview.className = "tray-icon-preview";
    preview.src = option.previewHref;
    preview.alt = `${option.label} tray icon preview`;

    const content = document.createElement("span");
    content.className = "tray-icon-copy";

    const title = document.createElement("span");
    title.className = "tray-icon-title";
    title.textContent = option.label;

    const description = document.createElement("span");
    description.className = "tray-icon-description";
    description.textContent = option.description;

    content.append(title, description);
    button.append(preview, content);
    button.addEventListener("click", async () => {
      await saveTrayIcon(option.name);
    });
    trayIconOptionsEl.append(button);
  }

  syncTrayIconToggle();
}

function renderAppBrandIcons() {
  const trayIconOption = TRAY_ICON_OPTIONS.find((option) => option.name === (state.settings?.trayIcon ?? "grid")) ?? TRAY_ICON_OPTIONS[0];

  appBrandIconEl.innerHTML = "";
  toolbarAppIconEl.innerHTML = "";

  const headerPreview = document.createElement("img");
  headerPreview.src = trayIconOption.previewHref;
  headerPreview.alt = "";
  headerPreview.className = "app-brand-icon-image";

  const toolbarPreview = document.createElement("img");
  toolbarPreview.src = trayIconOption.previewHref;
  toolbarPreview.alt = "";
  toolbarPreview.className = "toolbar-app-icon-image";

  appBrandIconEl.append(headerPreview);
  toolbarAppIconEl.append(toolbarPreview);
}

function syncTrayIconToggle() {
  const selectedTrayIcon = state.settings?.trayIcon ?? "grid";
  const buttons = trayIconOptionsEl.querySelectorAll<HTMLButtonElement>(".tray-icon-option");

  for (const button of buttons) {
    const isActive = button.dataset.trayIcon === selectedTrayIcon;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  renderAppBrandIcons();
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
    syncBusyButtons();
    return;
  }

  for (const project of filteredProjects) {
    projectGridEl.append(createProjectCard(project));
  }

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
  if (project.workspacePath) {
    status.append(
      createStatusAction(
        "workspace",
        `Open ${project.name} workspace in VS Code`,
        async () => {
          await openInCode(project.workspacePath as string, `Opened ${project.name} workspace in VS Code.`);
        },
      ),
    );
  } else {
    status.append(
      createStatusAction(
        "workspace",
        `Create default workspace for ${project.name}`,
        async () => {
          await createDefaultWorkspace(project);
        },
      ),
    );
  }

  status.append(
    createStatusAction(
      "terminal",
      `Open ${project.name} in Terminal`,
      async () => {
        await openInTerminal(project.path, `Opened ${project.name} in Terminal.`);
      },
    ),
  );

  status.append(
    createStatusAction(
      "opencode",
      `Open ${project.name} with Opencode`,
      async () => {
        await openInOpencode(project.path, `Opened ${project.name} with Opencode.`);
      },
    ),
  );

  status.append(
    createStatusAction(
      "folder",
      `Open ${project.name} folder in VS Code`,
      async () => {
        await openInCode(project.path, `Opened ${project.name} in VS Code.`);
      },
    ),
  );

  if (project.isGitRepo) {
    status.append(
      createStatusAction("git", `View git history for ${project.name}`, async () => {
        await openGitHistory(project);
      }),
    );
  }

  const title = document.createElement("h3");
  title.textContent = project.name;
  title.className = "project-title";

  titleRow.append(projectIcon, title);
  identity.append(titleRow);
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

  const modified = document.createElement("p");
  modified.className = "project-modified";
  modified.textContent = project.lastModifiedEpochMs
    ? `Updated ${dateFormatter.format(project.lastModifiedEpochMs)}`
    : "Modified time unavailable";

  detailsPanel.prepend(detailsHeader, detailValue);

  const actions = document.createElement("div");
  actions.className = "project-actions";

  const configuredActions = getProjectCardActions(project);

  if (configuredActions.length > 0) {
    const actionPanel = document.createElement("div");
    actionPanel.className = "project-action-panel";

    const actionLabel = document.createElement("p");
    actionLabel.className = "detail-label";
    actionLabel.textContent = "Open In";

    for (const button of configuredActions) {
      actions.append(button);
    }

    actionPanel.append(actionLabel, actions);
    footer.append(actionPanel);
  }

  footer.append(modified);
  card.append(header, detailsPanel, footer);
  return card;
}

function getProjectCardActions(project: Project) {
  const configuredActions = state.settings?.cardActions ?? [];
  const resolvedActions: CardActionName[] = configuredActions.length > 0
    ? configuredActions
    : ["workspace", "opencode", "terminal"];

  return resolvedActions
    .map((actionName, index) => createConfiguredProjectAction(project, actionName, index === 0))
    .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);
}

function createConfiguredProjectAction(project: Project, actionName: CardActionName, isPrimary: boolean) {
  const variant = isPrimary ? "primary" : "secondary";

  switch (actionName) {
    case "workspace":
      if (project.workspacePath) {
        return createProjectActionButton(
          "workspace",
          "VS Code Workspace",
          "Open the saved workspace in VS Code",
          `Open ${project.name} workspace in VS Code`,
          variant === "primary" ? "primary-action" : "secondary-action",
          async () => {
            await openInCode(project.workspacePath as string, `Opened ${project.name} workspace in VS Code.`);
          },
        );
      }

      return createProjectActionButton(
        "workspace",
        "Create Workspace",
        "Create and open a default VS Code workspace",
        `Create default workspace for ${project.name}`,
        variant === "primary" ? "primary-action" : "secondary-action",
        async () => {
          await createDefaultWorkspace(project);
        },
      );
    case "folder":
      return createProjectActionButton(
        "folder",
        "VS Code Folder",
        "Open the project folder in VS Code",
        `Open ${project.name} folder in VS Code`,
        variant === "primary" ? "primary-action folder-primary-action" : "secondary-action",
        async () => {
          await openInCode(project.path, `Opened ${project.name} in VS Code.`);
        },
      );
    case "terminal":
      return createProjectActionButton(
        "terminal",
        "Terminal",
        "Open the project folder in your preferred terminal",
        `Open ${project.name} in Terminal`,
        variant === "primary" ? "primary-action" : "secondary-action",
        async () => {
          await openInTerminal(project.path, `Opened ${project.name} in Terminal.`);
        },
      );
    case "opencode":
      return createProjectActionButton(
        "opencode",
        "Opencode",
        "Open the project folder in Opencode",
        `Open ${project.name} with Opencode`,
        variant === "primary" ? "primary-action" : "secondary-action",
        async () => {
          await openInOpencode(project.path, `Opened ${project.name} with Opencode.`);
        },
      );
    case "git":
      if (!project.isGitRepo) {
        return null;
      }

      return createProjectActionButton(
        "git",
        "Git History",
        "Open recent commits and branches",
        `View git history for ${project.name}`,
        variant === "primary" ? "primary-action" : "secondary-action",
        async () => {
          await openGitHistory(project);
        },
      );
    case "none":
    default:
      return null;
  }
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

function createStatusAction(icon: IconName, label: string, onClick: () => Promise<void>, initiallyDisabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `status-action status-action-${icon}`;
  button.append(createIcon(icon, "badge-icon"));
  button.title = label;
  button.setAttribute("aria-label", label);
  button.dataset.baseDisabled = String(initiallyDisabled);
  button.disabled = initiallyDisabled;
  button.addEventListener("click", async () => {
    await onClick();
  });
  return button;
}

function createProjectActionButton(
  icon: IconName,
  label: string,
  description: string,
  title: string,
  className: string,
  onClick: () => Promise<void>,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.dataset.baseDisabled = "false";

  const iconBadge = document.createElement("span");
  iconBadge.className = "project-action-icon";
  iconBadge.append(createIcon(icon, "button-icon"));

  const copy = document.createElement("span");
  copy.className = "project-action-copy";

  const labelText = document.createElement("span");
  labelText.className = "project-action-label";
  labelText.textContent = label;

  const descriptionText = document.createElement("span");
  descriptionText.className = "project-action-description";
  descriptionText.textContent = description;

  copy.append(labelText, descriptionText);
  button.append(iconBadge, copy);
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
    case "terminal":
      return [
        { tag: "rect", attributes: { ...common, x: "3", y: "5", width: "18", height: "14", rx: "2.5" } },
        { tag: "path", attributes: { ...common, d: "M7.5 10.5 10 12l-2.5 1.5" } },
        { tag: "path", attributes: { ...common, d: "M12.5 14.5h4" } },
      ];
    case "opencode":
      return [
        { tag: "rect", attributes: { ...common, x: "3", y: "5", width: "18", height: "14", rx: "2.5" } },
        { tag: "path", attributes: { ...common, d: "M8 9.5 5.5 12 8 14.5" } },
        { tag: "path", attributes: { ...common, d: "M16 9.5 18.5 12 16 14.5" } },
        { tag: "path", attributes: { ...common, d: "M10.5 16l3-8" } },
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

function loadColorSchemeMode(): ColorSchemeMode {
  const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
}

function loadAppTheme(): AppTheme {
  const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
  if (isAppTheme(stored)) {
    return stored;
  }

  return "neon";
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

  const isLight = state.colorSchemeMode === "light";
  const isDark = state.colorSchemeMode === "dark";
  const isSystem = state.colorSchemeMode === "system";
  colorSchemeLightButtonEl.classList.toggle("is-active", isLight);
  colorSchemeDarkButtonEl.classList.toggle("is-active", isDark);
  colorSchemeSystemButtonEl.classList.toggle("is-active", isSystem);
  colorSchemeLightButtonEl.setAttribute("aria-pressed", String(isLight));
  colorSchemeDarkButtonEl.setAttribute("aria-pressed", String(isDark));
  colorSchemeSystemButtonEl.setAttribute("aria-pressed", String(isSystem));
  colorSchemeSystemButtonEl.textContent = `System (${resolvedColorSchemeMode === "dark" ? "Dark" : "Light"})`;
}

function applyAppTheme() {
  document.documentElement.dataset.appTheme = state.appTheme;

  for (const button of appThemeButtonEls) {
    const buttonTheme = button.dataset.appThemeValue;
    const isActive = buttonTheme === state.appTheme;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function setColorSchemeMode(colorSchemeMode: ColorSchemeMode) {
  state.colorSchemeMode = colorSchemeMode;
  window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, state.colorSchemeMode);
  applyColorSchemeMode();
}

function setAppTheme(appTheme: AppTheme) {
  state.appTheme = appTheme;
  window.localStorage.setItem(APP_THEME_STORAGE_KEY, state.appTheme);
  applyAppTheme();
}

function syncSystemThemeListener() {
  if (systemThemeMediaQuery) {
    systemThemeMediaQuery.removeEventListener("change", applyColorSchemeMode);
  }

  systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeMediaQuery.addEventListener("change", applyColorSchemeMode);
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

async function openInTerminal(targetPath: string, message: string) {
  state.terminalPath = targetPath;
  syncBusyButtons();
  setStatus(`Launching Terminal for ${targetPath}...`);

  try {
    await invoke("open_in_terminal", { targetPath });
    setStatus(message);
  } catch (error) {
    setStatus(String(error), true);
  } finally {
    state.terminalPath = "";
    syncBusyButtons();
  }
}

async function openInOpencode(targetPath: string, message: string) {
  state.opencodePath = targetPath;
  syncBusyButtons();
  setStatus(`Launching Opencode for ${targetPath}...`);

  try {
    await invoke("open_in_opencode", { targetPath });
    setStatus(message);
  } catch (error) {
    setStatus(String(error), true);
  } finally {
    state.opencodePath = "";
    syncBusyButtons();
  }
}

async function createDefaultWorkspace(project: Project) {
  state.creatingWorkspacePath = project.path;
  syncBusyButtons();
  setStatus(`Creating a default workspace for ${project.name}...`);

  try {
    await invoke<string>("create_default_workspace", { projectPath: project.path });
    await fetchProjects();
    setStatus(`Created a default workspace for ${project.name}.`);
  } catch (error) {
    setStatus(String(error), true);
  } finally {
    state.creatingWorkspacePath = "";
    syncBusyButtons();
  }
}

function syncBusyButtons() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".status-row button, .project-actions button, #refresh-button");
  const isBusy = state.openingPath.length > 0
    || state.creatingWorkspacePath.length > 0
    || state.terminalPath.length > 0
    || state.opencodePath.length > 0;

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
  if (!state.settings) {
    return;
  }

  projectRootInputEl.value = state.settings.projectRoot;
  preferredTerminalSelectEl.value = state.settings.preferredTerminal;
  syncCardActionSelects();
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
  settingsStatusEl = document.querySelector("#settings-status") as HTMLElement;
  projectRootResetEl = document.querySelector("#project-root-reset") as HTMLButtonElement;
  appThemeButtonEls = Array.from(document.querySelectorAll("[data-app-theme-option]")) as HTMLButtonElement[];
  colorSchemeLightButtonEl = document.querySelector("#theme-light") as HTMLButtonElement;
  colorSchemeDarkButtonEl = document.querySelector("#theme-dark") as HTMLButtonElement;
  colorSchemeSystemButtonEl = document.querySelector("#theme-system") as HTMLButtonElement;

  renderTrayIconOptions();
  renderAppBrandIcons();

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
    button.addEventListener("click", () => {
      const nextTheme = button.dataset.appThemeValue ?? null;

      if (isAppTheme(nextTheme)) {
        setAppTheme(nextTheme);
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
  applyAppTheme();
  applyColorSchemeMode();
  void initializeApp();
});

function isCardActionName(value: string): value is CardActionName {
  return CARD_ACTION_OPTIONS.some((option) => option.name === value);
}
