import type {
  GitBranchEntry,
  GitChangedFile,
  GitCommitDetails,
  GitCommitEntry,
  GitOverview,
  GitWorktreeEntry,
} from "../types";

type GitHistoryElements = {
  historyModal: HTMLDialogElement;
  historyProjectName: HTMLElement;
  historyOverview: HTMLElement;
  historyStatus: HTMLElement;
  historyList: HTMLElement;
  historyBranchSelect: HTMLSelectElement;
  createWorktreeButton: HTMLButtonElement;
  pruneWorktreesButton: HTMLButtonElement;
  worktreeList: HTMLElement;
  staleWorktreeSection: HTMLElement;
  staleWorktreeList: HTMLElement;
  historyChanges: HTMLElement;
  commitModal: HTMLDialogElement;
  commitSubject: HTMLElement;
  commitMeta: HTMLElement;
  commitBody: HTMLElement;
};

type GitHistoryDependencies = {
  onOpenWorktree: (worktree: GitWorktreeEntry) => Promise<void>;
  onOpenCommitDetails: (commitRef: string) => Promise<void>;
};

export function createGitHistoryPanel(
  elements: GitHistoryElements,
  dependencies: GitHistoryDependencies,
) {
  function prepare(projectName: string) {
    elements.historyProjectName.textContent = `${projectName} commits`;
    setStatus("Loading branches...");
    elements.historyList.innerHTML = "";
    elements.historyOverview.textContent = "";
    elements.historyBranchSelect.disabled = true;
    elements.historyBranchSelect.innerHTML = "";
    elements.worktreeList.innerHTML = "";
    elements.historyChanges.innerHTML = "";

    if (!elements.historyModal.open) {
      document.body.classList.add("modal-open");
      elements.historyModal.showModal();
    }
  }

  function setStatus(message: string, isError = false) {
    elements.historyStatus.textContent = message;
    elements.historyStatus.dataset.state = isError ? "error" : "default";
  }

  function renderBranchOptions(branches: GitBranchEntry[]) {
    elements.historyBranchSelect.innerHTML = "";

    if (branches.length === 0) {
      const option = document.createElement("option");
      option.value = "HEAD";
      option.textContent = "No local branches found";
      elements.historyBranchSelect.append(option);
      elements.historyBranchSelect.disabled = true;
      return;
    }

    for (const branch of branches) {
      const option = document.createElement("option");
      option.value = branch.name;
      option.textContent = branch.isCurrent ? `${branch.name} (current)` : branch.name;
      elements.historyBranchSelect.append(option);
    }

    elements.historyBranchSelect.disabled = false;
  }

  function selectBranch(branchName: string) {
    elements.historyBranchSelect.value = branchName;
  }

  function renderOverview(overview: GitOverview) {
    const upstream = overview.upstreamBranch ? `Upstream ${overview.upstreamBranch}` : "No upstream";
    const sync = overview.upstreamBranch ? `Ahead ${overview.aheadCount} / Behind ${overview.behindCount}` : "Local only";
    const dirty = overview.isDirty ? "Dirty" : "Clean";
    elements.historyOverview.textContent = `${overview.currentBranch} - ${upstream} - ${sync} - ${dirty}`;
    renderChanges(overview.changedFiles);
  }

  function renderWorktrees(worktrees: GitWorktreeEntry[], isPruning: boolean) {
    elements.worktreeList.innerHTML = "";
    elements.staleWorktreeList.innerHTML = "";

    const activeWorktrees = worktrees.filter((worktree) => !worktree.isStale);
    const staleWorktrees = worktrees.filter((worktree) => worktree.isStale);
    elements.staleWorktreeSection.hidden = staleWorktrees.length === 0;
    elements.pruneWorktreesButton.disabled = staleWorktrees.length === 0 || isPruning;

    if (activeWorktrees.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "history-empty";
      emptyState.textContent = "No active worktrees inside the configured project root were found for this repository.";
      elements.worktreeList.append(emptyState);
    }

    for (const worktree of activeWorktrees) {
      elements.worktreeList.append(createWorktreeItem(worktree));
    }

    for (const worktree of staleWorktrees) {
      elements.staleWorktreeList.append(createWorktreeItem(worktree));
    }
  }

  function renderHistory(commits: GitCommitEntry[]) {
    elements.historyList.innerHTML = "";
    elements.historyStatus.dataset.state = "default";

    if (commits.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "history-empty";
      emptyState.textContent = "No git commits were returned for this repository.";
      elements.historyList.append(emptyState);
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
        await dependencies.onOpenCommitDetails(commit.shortHash);
      });
      elements.historyList.append(item);
    }
  }

  function openCommitLoading() {
    elements.commitSubject.textContent = "Loading commit...";
    elements.commitMeta.textContent = "";
    elements.commitBody.textContent = "";

    if (!elements.commitModal.open) {
      elements.commitModal.showModal();
    }
  }

  function renderCommitDetails(details: GitCommitDetails) {
    elements.commitSubject.textContent = details.subject;
    elements.commitMeta.textContent = `${details.shortHash} - ${details.authorName} <${details.authorEmail}> - ${details.authoredRelativeTime}`;
    elements.commitBody.textContent = details.body || "No commit body.";
  }

  function renderCommitError(error: string) {
    elements.commitSubject.textContent = "Could not load commit";
    elements.commitMeta.textContent = error;
    elements.commitBody.textContent = "";
  }

  function reset() {
    document.body.classList.remove("modal-open");
    elements.historyOverview.textContent = "";
    elements.historyStatus.dataset.state = "default";
    elements.historyStatus.textContent = "";
    elements.worktreeList.innerHTML = "";
    elements.staleWorktreeList.innerHTML = "";
    elements.staleWorktreeSection.hidden = true;
    elements.historyChanges.innerHTML = "";
    elements.historyList.innerHTML = "";
    elements.historyBranchSelect.innerHTML = "";
  }

  function createWorktreeItem(worktree: GitWorktreeEntry) {
    const item = document.createElement("article");
    item.className = "worktree-item";
    if (worktree.isStale) {
      item.dataset.state = "stale";
    }

    const lane = document.createElement("span");
    lane.className = "worktree-lane";
    lane.dataset.kind = worktree.isStale
      ? "stale"
      : worktree.isPrimary
        ? "primary"
        : worktree.isCurrent
          ? "current"
          : "linked";

    const body = document.createElement("div");
    body.className = "worktree-item-body";

    const header = document.createElement("div");
    header.className = "worktree-item-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "worktree-item-title-wrap";

    const title = document.createElement("h3");
    title.className = "worktree-item-title";
    title.textContent = worktree.name;

    const badges = document.createElement("div");
    badges.className = "worktree-badges";

    for (const label of getWorktreeBadges(worktree)) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = label;
      badges.append(badge);
    }

    titleWrap.append(title, badges);

    const actions = document.createElement("div");
    actions.className = "worktree-item-actions";

    if (!worktree.isStale) {
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "button-secondary worktree-action-button";
      openButton.textContent = worktree.hasWorkspace ? "Open Workspace" : "Open Folder";
      openButton.dataset.baseDisabled = "false";
      openButton.addEventListener("click", async () => {
        await dependencies.onOpenWorktree(worktree);
      });

      actions.append(openButton);
    }

    header.append(titleWrap, actions);

    const branch = document.createElement("p");
    branch.className = "worktree-meta";
    branch.textContent = worktree.isStale
      ? "Missing worktree path still registered in Git metadata."
      : worktree.branch
        ? `Branch ${worktree.branch}`
        : worktree.isDetached
          ? "Detached HEAD"
          : "Branch unavailable";

    const path = document.createElement("p");
    path.className = "worktree-path";
    path.textContent = worktree.displayPath;

    body.append(header, branch, path);
    item.append(lane, body);
    return item;
  }

  function renderChanges(changedFiles: GitChangedFile[]) {
    elements.historyChanges.innerHTML = "";

    if (changedFiles.length === 0) {
      return;
    }

    const sections: Array<{ title: string; status: GitChangedFile["status"] }> = [
      { title: "Staged files", status: "staged" },
      { title: "Modified files", status: "modified" },
      { title: "Untracked files", status: "untracked" },
    ];

    for (const section of sections) {
      const files = changedFiles.filter((file) => file.status === section.status);

      if (files.length === 0) {
        continue;
      }

      const group = document.createElement("section");
      group.className = "history-change-group";

      const heading = document.createElement("p");
      heading.className = "history-change-heading";
      heading.textContent = `${section.title} (${files.length})`;

      const list = document.createElement("ul");
      list.className = "history-change-list";

      for (const file of files) {
        const item = document.createElement("li");
        item.className = "history-change-item";

        const badge = document.createElement("span");
        badge.className = "history-change-badge";
        badge.textContent = file.badge;

        const path = document.createElement("span");
        path.className = "history-change-path";
        path.textContent = file.path;

        item.append(badge, path);
        list.append(item);
      }

      group.append(heading, list);
      elements.historyChanges.append(group);
    }
  }

  return {
    openCommitLoading,
    prepare,
    renderBranchOptions,
    renderCommitDetails,
    renderCommitError,
    renderHistory,
    renderOverview,
    renderWorktrees,
    reset,
    selectBranch,
    setStatus,
  };
}

function getWorktreeBadges(worktree: GitWorktreeEntry) {
  const badges = [] as string[];

  if (worktree.isPrimary) {
    badges.push("Primary");
  }
  if (worktree.isStale) {
    badges.push("Stale");
  }
  if (worktree.isCurrent) {
    badges.push("Current");
  }
  if (worktree.isDirty) {
    badges.push("Dirty");
  } else if (!worktree.isStale) {
    badges.push("Clean");
  }
  if (worktree.hasWorkspace) {
    badges.push("Workspace");
  }
  if (worktree.isLocked) {
    badges.push("Locked");
  }
  if (worktree.isPrunable) {
    badges.push("Prunable");
  }

  return badges;
}
