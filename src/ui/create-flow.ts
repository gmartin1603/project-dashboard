type CreateFlowElements = {
  createProjectWorkspaceModal: HTMLDialogElement;
  createProjectWorkspaceName: HTMLInputElement;
  createProjectWorkspaceStatus: HTMLElement;
  createWorktreeModal: HTMLDialogElement;
  createWorktreeBranchName: HTMLInputElement;
  createWorktreePathPreview: HTMLElement;
  createWorktreeStatus: HTMLElement;
};

export function createCreateFlowController(elements: CreateFlowElements) {
  function openProjectWorkspaceModal() {
    elements.createProjectWorkspaceName.value = "";
    setProjectWorkspaceStatus("");
    elements.createProjectWorkspaceModal.showModal();
  }

  function closeProjectWorkspaceModal() {
    elements.createProjectWorkspaceModal.close();
  }

  function setProjectWorkspaceStatus(message: string, isError = false) {
    elements.createProjectWorkspaceStatus.textContent = message;
    elements.createProjectWorkspaceStatus.dataset.state = isError ? "error" : "default";
  }

  function openWorktreeModal(activeProjectName: string) {
    elements.createWorktreeBranchName.value = "";
    updateWorktreePreview(activeProjectName);
    setWorktreeStatus("");
    elements.createWorktreeModal.showModal();
  }

  function closeWorktreeModal() {
    elements.createWorktreeModal.close();
  }

  function setWorktreeStatus(message: string, isError = false) {
    elements.createWorktreeStatus.textContent = message;
    elements.createWorktreeStatus.dataset.state = isError ? "error" : "default";
  }

  function updateWorktreePreview(activeProjectName: string) {
    const branchName = sanitizeName(elements.createWorktreeBranchName.value);
    const repoName = activeProjectName ? sanitizeName(activeProjectName) : "project";

    if (!branchName) {
      elements.createWorktreePathPreview.textContent = "Folder name will be generated after you enter a branch.";
      return;
    }

    elements.createWorktreePathPreview.textContent = `Folder: ${repoName}-${branchName}`;
  }

  function getProjectWorkspaceName() {
    return elements.createProjectWorkspaceName.value.trim();
  }

  function getWorktreeBranchName() {
    return elements.createWorktreeBranchName.value.trim();
  }

  return {
    closeProjectWorkspaceModal,
    closeWorktreeModal,
    getProjectWorkspaceName,
    getWorktreeBranchName,
    openProjectWorkspaceModal,
    openWorktreeModal,
    setProjectWorkspaceStatus,
    setWorktreeStatus,
    updateWorktreePreview,
  };
}

function sanitizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._\-/\s]+/g, "")
    .replace(/[\s/_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
