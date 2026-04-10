import type { Project } from "../types";

type BusyState = {
  openingPath: string;
  creatingWorkspacePath: string;
  creatingProjectWorkspace: boolean;
  creatingGitWorktree: boolean;
  pruningGitWorktrees: boolean;
  terminalPath: string;
  opencodePath: string;
  archivingPath: string;
};

type CommandCenterDependencies = {
  status: HTMLElement;
  getBusyState: () => BusyState;
  patchBusyState: (patch: Partial<BusyState>) => void;
  invokeCommand: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  refreshProjects: () => Promise<void>;
};

export function createCommandCenter(dependencies: CommandCenterDependencies) {
  function setStatus(message: string, isError = false) {
    dependencies.status.textContent = message;
    dependencies.status.dataset.state = isError ? "error" : "default";
  }

  function syncBusyButtons() {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      ".project-card button, #refresh-button, .history-actions button, .worktree-action-button, .create-form button",
    );
    const busyState = dependencies.getBusyState();
    const isBusy = busyState.openingPath.length > 0
      || busyState.creatingWorkspacePath.length > 0
      || busyState.creatingProjectWorkspace
      || busyState.creatingGitWorktree
      || busyState.pruningGitWorktrees
      || busyState.terminalPath.length > 0
      || busyState.opencodePath.length > 0
      || busyState.archivingPath.length > 0;

    for (const button of buttons) {
      const baseDisabled = button.dataset.baseDisabled === "true";
      button.disabled = isBusy || baseDisabled;
    }
  }

  async function openInCode(targetPath: string, message: string) {
    await runTargetPathCommand({
      busyKey: "openingPath",
      targetPath,
      launchMessage: `Launching VS Code for ${targetPath}...`,
      successMessage: message,
      command: "open_in_code",
    });
  }

  async function openInTerminal(targetPath: string, message: string) {
    await runTargetPathCommand({
      busyKey: "terminalPath",
      targetPath,
      launchMessage: `Launching Terminal for ${targetPath}...`,
      successMessage: message,
      command: "open_in_terminal",
    });
  }

  async function openInOpencode(targetPath: string, message: string) {
    await runTargetPathCommand({
      busyKey: "opencodePath",
      targetPath,
      launchMessage: `Launching Opencode for ${targetPath}...`,
      successMessage: message,
      command: "open_in_opencode",
    });
  }

  async function createDefaultWorkspace(project: Project) {
    dependencies.patchBusyState({ creatingWorkspacePath: project.path });
    syncBusyButtons();
    setStatus(`Creating a default workspace for ${project.name}...`);

    try {
      await dependencies.invokeCommand("create_default_workspace", { projectPath: project.path });
      await dependencies.refreshProjects();
      setStatus(`Created a default workspace for ${project.name}.`);
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      dependencies.patchBusyState({ creatingWorkspacePath: "" });
      syncBusyButtons();
    }
  }

  async function runTargetPathCommand(options: {
    busyKey: "openingPath" | "terminalPath" | "opencodePath";
    targetPath: string;
    launchMessage: string;
    successMessage: string;
    command: string;
  }) {
    dependencies.patchBusyState({ [options.busyKey]: options.targetPath });
    syncBusyButtons();
    setStatus(options.launchMessage);

    try {
      await dependencies.invokeCommand(options.command, { targetPath: options.targetPath });
      setStatus(options.successMessage);
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      dependencies.patchBusyState({ [options.busyKey]: "" });
      syncBusyButtons();
    }
  }

  return {
    createDefaultWorkspace,
    openInCode,
    openInOpencode,
    openInTerminal,
    setStatus,
    syncBusyButtons,
  };
}
