import type { Project, ViewMode } from "../types";

type ProjectsPanelElements = {
  projectGrid: HTMLElement;
  projectCount: HTMLElement;
  workspaceCount: HTMLElement;
  viewDetailedButton: HTMLButtonElement;
  viewCompactButton: HTMLButtonElement;
};

export function createProjectsPanel(elements: ProjectsPanelElements) {
  function renderProjects(
    projects: Project[],
    allProjects: Project[],
    viewMode: ViewMode,
    renderProject: (project: Project) => HTMLElement,
  ) {
    elements.projectGrid.innerHTML = "";
    elements.projectGrid.dataset.viewMode = viewMode;
    elements.projectCount.textContent = `${projects.length} visible`;
    elements.workspaceCount.textContent = `${allProjects.filter((project) => project.hasWorkspace).length} with workspaces`;
    syncViewToggle(viewMode);

    if (projects.length === 0) {
      renderEmptyState(
        "No matches",
        "Try a different project name or update the configured root.",
        "Your search checks names, folders, and workspace files.",
      );
      return;
    }

    for (const project of projects) {
      elements.projectGrid.append(renderProject(project));
    }
  }

  function renderLoadError(error: string) {
    elements.projectGrid.innerHTML = "";
    renderEmptyState(
      "Could not load projects",
      "Check the configured project root.",
      error,
    );
  }

  function syncViewToggle(viewMode: ViewMode) {
    const isDetailed = viewMode === "detailed";
    elements.viewDetailedButton.classList.toggle("is-active", isDetailed);
    elements.viewCompactButton.classList.toggle("is-active", !isDetailed);
    elements.viewDetailedButton.setAttribute("aria-pressed", String(isDetailed));
    elements.viewCompactButton.setAttribute("aria-pressed", String(!isDetailed));
  }

  function renderEmptyState(eyebrow: string, title: string, body: string) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `
      <p class="empty-eyebrow">${eyebrow}</p>
      <h2>${title}</h2>
      <p>${body}</p>
    `;
    elements.projectGrid.append(emptyState);
  }

  return {
    renderLoadError,
    renderProjects,
    syncViewToggle,
  };
}
