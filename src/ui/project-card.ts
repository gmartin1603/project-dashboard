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
};

export function createProjectCard(project: Project, dependencies: ProjectCardDependencies) {
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
          await dependencies.openInCode(project.workspacePath as string, `Opened ${project.name} workspace in VS Code.`);
        },
      ),
    );
  } else {
    status.append(
      createStatusAction(
        "workspace",
        `Create default workspace for ${project.name}`,
        async () => {
          await dependencies.createDefaultWorkspace(project);
        },
      ),
    );
  }

  status.append(
    createStatusAction(
      "terminal",
      `Open ${project.name} in Terminal`,
      async () => {
        await dependencies.openInTerminal(project.path, `Opened ${project.name} in Terminal.`);
      },
    ),
  );

  status.append(
    createStatusAction(
      "opencode",
      `Open ${project.name} with Opencode`,
      async () => {
        await dependencies.openInOpencode(project.path, `Opened ${project.name} with Opencode.`);
      },
    ),
  );

  status.append(
    createStatusAction(
      "folder",
      `Open ${project.name} folder in VS Code`,
      async () => {
        await dependencies.openInCode(project.path, `Opened ${project.name} in VS Code.`);
      },
    ),
  );

  if (project.isGitRepo) {
    status.append(
      createStatusAction("git", `View git history for ${project.name}`, async () => {
        await dependencies.openGitHistory(project);
      }),
    );
  }

  const title = document.createElement("h3");
  title.textContent = project.name;
  title.className = "project-title";

  titleRow.append(title);
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

  const gitSummary = project.isGitRepo ? createGitSummaryStrip(project) : null;

  if (project.techTags.length > 0) {
    detailsPanel.append(createTechStrip(project.techTags));
  }

  if (gitSummary) {
    detailsPanel.append(gitSummary);
  }

  const footer = document.createElement("div");
  footer.className = "project-footer";

  const modified = document.createElement("p");
  modified.className = "project-modified";
  modified.textContent = project.lastModifiedEpochMs
    ? `Updated ${dependencies.dateFormatter.format(project.lastModifiedEpochMs)}`
    : "Modified time unavailable";

  detailsPanel.prepend(detailsHeader, detailValue);

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

  footer.append(modified);
  card.append(header, detailsPanel, footer);
  return card;
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
