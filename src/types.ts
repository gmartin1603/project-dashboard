export type Project = {
  name: string;
  path: string;
  workspacePath: string | null;
  hasWorkspace: boolean;
  isGitRepo: boolean;
  gitBranch: string | null;
  gitCommonDir: string | null;
  gitWorktreeCount: number | null;
  isPrimaryWorktree: boolean | null;
  lastModifiedEpochMs: number | null;
  techTags: string[];
};

export type ViewMode = "detailed" | "compact";
export type IconName = "workspace" | "folder" | "git" | "terminal" | "opencode" | "archive" | "more";
export type TrayIconName = "grid" | "orbit" | "stacks";
export type CardActionName = "workspace" | "folder" | "terminal" | "opencode" | "git" | "none";
export type LayoutName = "standard" | "sidebar-dock";
export type TechIconName =
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

export type ColorSchemeMode = "light" | "dark" | "system";

export type AppTheme = "default" | "neon" | "ember" | "fjord" | "signal";

export type AppSettings = {
  projectRoot: string;
  defaultProjectRoot: string;
  preferredTerminal: string;
  trayIcon: TrayIconName;
  cardActions: CardActionName[];
  layout: LayoutName;
  appTheme: AppTheme;
};

export type GitCommitEntry = {
  shortHash: string;
  subject: string;
  relativeTime: string;
};

export type GitBranchEntry = {
  name: string;
  isCurrent: boolean;
};

export type GitOverview = {
  currentBranch: string;
  upstreamBranch: string | null;
  aheadCount: number;
  behindCount: number;
  isDirty: boolean;
  changedFiles: GitChangedFile[];
};

export type GitChangedFile = {
  path: string;
  status: "staged" | "modified" | "untracked";
  badge: string;
};

export type GitCommitDetails = {
  shortHash: string;
  fullHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authoredRelativeTime: string;
};

export type GitWorktreeEntry = {
  name: string;
  path: string;
  displayPath: string;
  workspacePath: string | null;
  hasWorkspace: boolean;
  branch: string | null;
  isCurrent: boolean;
  isPrimary: boolean;
  isDetached: boolean;
  isLocked: boolean;
  isPrunable: boolean;
  isBare: boolean;
  isDirty: boolean;
  isStale: boolean;
};

export type CreateProjectWorkspaceResult = {
  projectPath: string;
  workspacePath: string;
};

export type CreateGitWorktreeResult = {
  projectPath: string;
  workspacePath: string | null;
  branch: string;
};

export type ReleaseNoteEntry = {
  version: string;
  items: string[];
};
