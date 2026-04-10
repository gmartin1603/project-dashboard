import type { CardActionName, IconName, Project, TechIconName } from "../types";
import { createIcon, createTechIcon, formatTechLabel } from "./icons";

type ProjectCardDependencies = {
  cardActions: CardActionName[];
  dateFormatter: Intl.DateTimeFormat;
  openInCode: (targetPath: string, message: string) => Promise<void>;
  openInTerminal: (targetPath: string, message: string) => Promise<void>;
  openInOpencode: (targetPath: string, message: string) => Promise<void>;
  openGitHistory: (project: Project) => Promise<void>;
  createDefaultWorkspace: (project: Project) => Promise<void>;
  archiveProject: (project: Project) => Promise<void>;
};

type MenuAction = {
  icon: IconName;
  label: string;
  description: string;
  destructive?: boolean;
  separated?: boolean;
  run: () => Promise<void>;
};

let activeMenuController: { close: () => void } | null = null;

export function createProjectCard(project: Project, dependencies: ProjectCardDependencies) {
  const card = document.createElement("article");
  card.className = "project-card";

  const header = document.createElement("div");
  header.className = "project-card-header";

  const identity = document.createElement("div");
  identity.className = "project-identity";

  const titleRow = document.createElement("div");
  titleRow.className = "project-title-row";

  const projectIcon = document.createElement("div");
  projectIcon.className = "project-icon";
  projectIcon.append(createIcon(project.workspacePath ? "workspace" : "folder"));

  const title = document.createElement("h3");
  title.textContent = project.name;
  title.className = "project-title";

  titleRow.append(projectIcon, title);
  identity.append(titleRow);

  const menu = createProjectActionsMenu(project, dependencies);
  header.append(identity, menu);

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

  detailsPanel.append(detailsHeader, detailValue);

  if (project.techTags.length > 0) {
    detailsPanel.append(createTechStrip(project.techTags));
  }

  const gitSummary = project.isGitRepo ? createGitSummaryStrip(project) : null;
  if (gitSummary) {
    detailsPanel.append(gitSummary);
  }

  const footer = document.createElement("div");
  footer.className = "project-footer";

  const actions = document.createElement("div");
  actions.className = "project-actions";

  const configuredActions = getProjectCardActions(project, dependencies);
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

  const modified = document.createElement("p");
  modified.className = "project-modified";
  modified.textContent = project.lastModifiedEpochMs
    ? `Updated ${dependencies.dateFormatter.format(project.lastModifiedEpochMs)}`
    : "Modified time unavailable";

  footer.append(modified);
  card.append(header, detailsPanel, footer);
  return card;
}

function createProjectActionsMenu(project: Project, dependencies: ProjectCardDependencies) {
  const menuWrap = document.createElement("div");
  menuWrap.className = "project-menu-wrap";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "project-menu-trigger";
  trigger.title = `Open actions for ${project.name}`;
  trigger.setAttribute("aria-label", `Open actions for ${project.name}`);
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.dataset.baseDisabled = "false";
  trigger.append(createIcon("more", "badge-icon"));

  const menu = document.createElement("div");
  menu.className = "project-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  const actions = getProjectMenuActions(project, dependencies);
  for (const action of actions) {
    menu.append(createMenuActionButton(action, () => closeMenu()));
  }

  let isMounted = false;

  const openMenu = () => {
    if (activeMenuController && activeMenuController.close !== closeMenu) {
      activeMenuController.close();
    }

    if (!isMounted) {
      document.body.append(menu);
      isMounted = true;
    }

    menu.hidden = false;
    menuWrap.dataset.menuOpen = "true";
    trigger.setAttribute("aria-expanded", "true");
    syncMenuPosition();
    activeMenuController = { close: closeMenu };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", syncMenuPosition);
    window.addEventListener("scroll", syncMenuPosition, true);
  };

  const closeMenu = () => {
    menu.hidden = true;
    delete menuWrap.dataset.menuOpen;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", handlePointerDown, true);
    document.removeEventListener("keydown", handleKeyDown);

    window.removeEventListener("resize", syncMenuPosition);
    window.removeEventListener("scroll", syncMenuPosition, true);

    if (isMounted) {
      menu.remove();
      isMounted = false;
    }

    if (activeMenuController?.close === closeMenu) {
      activeMenuController = null;
    }
  };

  const toggleMenu = () => {
    if (menu.hidden) {
      openMenu();
      return;
    }

    closeMenu();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (!menuWrap.contains(event.target as Node) && !menu.contains(event.target as Node)) {
      closeMenu();
    }
  };

  const syncMenuPosition = () => {
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const menuWidth = 216;
    const nextLeft = Math.min(
      rect.right - menuWidth,
      window.innerWidth - menuWidth - viewportPadding,
    );
    const nextTop = Math.min(rect.bottom + 10, window.innerHeight - viewportPadding - 8);

    menu.style.top = `${Math.max(viewportPadding, nextTop)}px`;
    menu.style.left = `${Math.max(viewportPadding, nextLeft)}px`;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeMenu();
      trigger.focus();
    }
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  menuWrap.append(trigger);
  return menuWrap;
}

function getProjectMenuActions(project: Project, dependencies: ProjectCardDependencies): MenuAction[] {
  const actions: MenuAction[] = [];

  if (project.workspacePath) {
    actions.push({
      icon: "workspace",
      label: "Open workspace",
      description: "Launch the saved VS Code workspace",
      run: async () => {
        await dependencies.openInCode(project.workspacePath as string, `Opened ${project.name} workspace in VS Code.`);
      },
    });
  } else {
    actions.push({
      icon: "workspace",
      label: "Create workspace",
      description: "Create a default workspace file for this project",
      run: async () => {
        await dependencies.createDefaultWorkspace(project);
      },
    });
  }

  actions.push(
    {
      icon: "folder",
      label: "Open folder in VS Code",
      description: "Launch the project folder directly",
      run: async () => {
        await dependencies.openInCode(project.path, `Opened ${project.name} in VS Code.`);
      },
    },
    {
      icon: "terminal",
      label: "Open in Terminal",
      description: "Launch the project in your preferred terminal",
      run: async () => {
        await dependencies.openInTerminal(project.path, `Opened ${project.name} in Terminal.`);
      },
    },
    {
      icon: "opencode",
      label: "Open in Opencode",
      description: "Launch the project in Opencode",
      run: async () => {
        await dependencies.openInOpencode(project.path, `Opened ${project.name} with Opencode.`);
      },
    },
  );

  if (project.isGitRepo) {
    actions.push({
      icon: "git",
      label: "View git history",
      description: "Open recent commits, branches, and worktrees",
      run: async () => {
        await dependencies.openGitHistory(project);
      },
    });
  }

  actions.push({
    icon: "archive",
    label: "Archive project",
    description: "Move this directory to the sibling archive folder",
    destructive: true,
    separated: true,
    run: async () => {
      await dependencies.archiveProject(project);
    },
  });

  return actions;
}

function getProjectCardActions(project: Project, dependencies: ProjectCardDependencies) {
  const resolvedActions: CardActionName[] = dependencies.cardActions.length > 0
    ? dependencies.cardActions
    : ["workspace", "opencode", "terminal"];

  return resolvedActions
    .map((actionName, index) => createConfiguredProjectAction(project, actionName, index === 0, dependencies))
    .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);
}

function createConfiguredProjectAction(
  project: Project,
  actionName: CardActionName,
  isPrimary: boolean,
  dependencies: ProjectCardDependencies,
) {
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
            await dependencies.openInCode(project.workspacePath as string, `Opened ${project.name} workspace in VS Code.`);
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
          await dependencies.createDefaultWorkspace(project);
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
          await dependencies.openInCode(project.path, `Opened ${project.name} in VS Code.`);
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
          await dependencies.openInTerminal(project.path, `Opened ${project.name} in Terminal.`);
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
          await dependencies.openInOpencode(project.path, `Opened ${project.name} with Opencode.`);
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
          await dependencies.openGitHistory(project);
        },
      );
    case "none":
    default:
      return null;
  }
}

function createMenuActionButton(action: MenuAction, closeMenu: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "project-menu-item";
  if (action.destructive) {
    button.classList.add("is-destructive");
  }
  if (action.separated) {
    button.classList.add("is-separated");
  }
  button.setAttribute("role", "menuitem");
  button.title = action.description;
  button.setAttribute("aria-label", action.label);
  button.dataset.baseDisabled = "false";

  const iconBadge = document.createElement("span");
  iconBadge.className = "project-action-icon";
  iconBadge.append(createIcon(action.icon, "button-icon"));

  const labelText = document.createElement("span");
  labelText.className = "project-action-label";
  labelText.textContent = action.label;

  button.append(iconBadge, labelText);
  button.addEventListener("click", async () => {
    closeMenu();
    await action.run();
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

function createGitSummaryStrip(project: Project) {
  const summary = document.createElement("div");
  summary.className = "git-summary-strip";

  if (project.gitBranch) {
    const branchBadge = document.createElement("span");
    branchBadge.className = "badge";
    branchBadge.textContent = `Branch ${project.gitBranch}`;
    summary.append(branchBadge);
  }

  if (project.gitWorktreeCount && project.gitWorktreeCount > 1) {
    const worktreeBadge = document.createElement("span");
    worktreeBadge.className = "badge";
    worktreeBadge.textContent = `${project.gitWorktreeCount} worktrees`;
    summary.append(worktreeBadge);
  }

  if (project.isPrimaryWorktree) {
    const primaryBadge = document.createElement("span");
    primaryBadge.className = "badge";
    primaryBadge.textContent = "Primary worktree";
    summary.append(primaryBadge);
  }

  return summary.childElementCount > 0 ? summary : null;
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
