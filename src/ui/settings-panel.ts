import type {
  AppSettings,
  AppTheme,
  CardActionName,
  ColorSchemeMode,
  LayoutName,
  TrayIconName,
} from "../types";

type TrayIconOption = {
  name: TrayIconName;
  label: string;
  description: string;
};

type SettingsPanelElements = {
  appBrandIcon: HTMLElement;
  toolbarAppIcon: HTMLElement;
  projectRootDisplay: HTMLElement;
  projectRootInput: HTMLInputElement;
  projectRootDefault: HTMLElement;
  preferredTerminalSelect: HTMLSelectElement;
  trayIconOptions: HTMLElement;
  cardActionSelects: HTMLSelectElement[];
  layoutButtons: HTMLButtonElement[];
  settingsStatus: HTMLElement;
  projectRootReset: HTMLButtonElement;
  appThemeButtons: HTMLButtonElement[];
  colorSchemeLightButton: HTMLButtonElement;
  colorSchemeDarkButton: HTMLButtonElement;
  colorSchemeSystemButton: HTMLButtonElement;
  settingsModal: HTMLDialogElement;
};

type SettingsPanelDependencies = {
  trayIconOptions: readonly TrayIconOption[];
  onTrayIconSelect: (trayIcon: TrayIconName) => Promise<void>;
};

export function createSettingsPanel(
  elements: SettingsPanelElements,
  dependencies: SettingsPanelDependencies,
) {
  function sync(settings: AppSettings | null, appTheme: AppTheme) {
    const selectedTrayIcon = settings?.trayIcon ?? "grid";
    const selectedLayout = settings?.layout ?? "standard";
    const selectedActions = settings?.cardActions ?? [];

    document.documentElement.dataset.appTheme = appTheme;
    document.documentElement.dataset.layout = selectedLayout === "sidebar-dock" ? "sidebar" : "standard";

    if (settings) {
      elements.projectRootDisplay.textContent = settings.projectRoot;
      elements.projectRootInput.value = settings.projectRoot;
      elements.projectRootDefault.textContent = `Default root: ${settings.defaultProjectRoot}`;
      elements.preferredTerminalSelect.value = settings.preferredTerminal;
    }

    syncCardActionSelects(selectedActions);
    syncLayoutButtons(selectedLayout);
    syncAppThemeButtons(appTheme);
    renderTrayIconOptions(selectedTrayIcon, appTheme);
  }

  function open(settings: AppSettings | null, appTheme: AppTheme) {
    if (!settings) {
      return;
    }

    sync(settings, appTheme);
    setStatus("");
    elements.settingsModal.showModal();
  }

  function setStatus(message: string, isError = false) {
    elements.settingsStatus.textContent = message;
    elements.settingsStatus.dataset.state = isError ? "error" : "default";
  }

  function syncColorScheme(colorSchemeMode: ColorSchemeMode, resolvedColorSchemeMode: "light" | "dark") {
    const isLight = colorSchemeMode === "light";
    const isDark = colorSchemeMode === "dark";
    const isSystem = colorSchemeMode === "system";

    elements.colorSchemeLightButton.classList.toggle("is-active", isLight);
    elements.colorSchemeDarkButton.classList.toggle("is-active", isDark);
    elements.colorSchemeSystemButton.classList.toggle("is-active", isSystem);
    elements.colorSchemeLightButton.setAttribute("aria-pressed", String(isLight));
    elements.colorSchemeDarkButton.setAttribute("aria-pressed", String(isDark));
    elements.colorSchemeSystemButton.setAttribute("aria-pressed", String(isSystem));
    elements.colorSchemeSystemButton.textContent = `System (${resolvedColorSchemeMode === "dark" ? "Dark" : "Light"})`;
  }

  function syncCardActionSelects(selectedActions: CardActionName[]) {
    for (const [index, select] of elements.cardActionSelects.entries()) {
      select.value = selectedActions[index] ?? "none";
    }
  }

  function syncLayoutButtons(layout: LayoutName) {
    for (const button of elements.layoutButtons) {
      const buttonLayout = button.dataset.layoutValue;
      const isActive = buttonLayout === layout;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function syncAppThemeButtons(appTheme: AppTheme) {
    for (const button of elements.appThemeButtons) {
      const buttonTheme = button.dataset.appThemeValue;
      const isActive = buttonTheme === appTheme;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function renderTrayIconOptions(selectedTrayIcon: TrayIconName, appTheme: AppTheme) {
    elements.trayIconOptions.innerHTML = "";

    for (const option of dependencies.trayIconOptions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tray-icon-option";
      button.dataset.trayIcon = option.name;

      const preview = document.createElement("img");
      preview.className = "tray-icon-preview";
      preview.src = getTrayIconPreviewUri(option.name, appTheme);
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
      button.classList.toggle("is-active", option.name === selectedTrayIcon);
      button.setAttribute("aria-pressed", String(option.name === selectedTrayIcon));
      button.addEventListener("click", async () => {
        await dependencies.onTrayIconSelect(option.name);
      });
      elements.trayIconOptions.append(button);
    }

    renderAppBrandIcons(selectedTrayIcon, appTheme);
  }

  function renderAppBrandIcons(selectedTrayIcon: TrayIconName, appTheme: AppTheme) {
    elements.appBrandIcon.innerHTML = "";
    elements.toolbarAppIcon.innerHTML = "";

    const headerPreview = document.createElement("img");
    headerPreview.src = getTrayIconPreviewUri(selectedTrayIcon, appTheme);
    headerPreview.alt = "";
    headerPreview.className = "app-brand-icon-image";

    const toolbarPreview = document.createElement("img");
    toolbarPreview.src = getTrayIconPreviewUri(selectedTrayIcon, appTheme);
    toolbarPreview.alt = "";
    toolbarPreview.className = "toolbar-app-icon-image";

    elements.appBrandIcon.append(headerPreview);
    elements.toolbarAppIcon.append(toolbarPreview);
  }

  return {
    open,
    setStatus,
    sync,
    syncColorScheme,
  };
}

function getTrayIconPreviewUri(iconName: TrayIconName, appTheme: AppTheme) {
  const svg = getTrayIconSvg(iconName, appTheme);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getTrayIconSvg(iconName: TrayIconName, appTheme: AppTheme) {
  const palette = getTrayIconPalette(appTheme);

  switch (iconName) {
    case "orbit":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="24" fill="${palette.base}"/><path d="M19 32c0-7.18 5.82-13 13-13 3.99 0 7.56 1.8 9.94 4.64" stroke="${palette.accent}" stroke-width="6" stroke-linecap="round"/><path d="M45 32c0 7.18-5.82 13-13 13-3.99 0-7.56-1.8-9.94-4.64" stroke="${palette.foreground}" stroke-width="6" stroke-linecap="round"/><circle cx="45" cy="25" r="4" fill="${palette.foreground}"/><circle cx="19" cy="39" r="4" fill="${palette.accent}"/></svg>`;
    case "stacks":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="14" y="14" width="36" height="36" rx="10" fill="${palette.base}"/><path d="M23 24h18" stroke="${palette.foreground}" stroke-width="5" stroke-linecap="round"/><path d="M23 32h18" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round"/><path d="M23 40h12" stroke="${palette.foreground}" stroke-width="5" stroke-linecap="round"/><path d="M46 18v28" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round"/></svg>`;
    case "grid":
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="10" y="10" width="44" height="44" rx="14" fill="${palette.base}"/><rect x="18" y="18" width="10" height="10" rx="3" fill="${palette.foreground}"/><rect x="36" y="18" width="10" height="10" rx="3" fill="${palette.accent}"/><rect x="18" y="36" width="10" height="10" rx="3" fill="${palette.accent}"/><rect x="36" y="36" width="10" height="10" rx="3" fill="${palette.foreground}"/></svg>`;
  }
}

function getTrayIconPalette(appTheme: AppTheme) {
  switch (appTheme) {
    case "ember":
      return { base: "#7f3115", foreground: "#fff8f0", accent: "#e0894c" };
    case "fjord":
      return { base: "#14344a", foreground: "#f6fcff", accent: "#59d9dd" };
    case "signal":
      return { base: "#1f2330", foreground: "#fff9f2", accent: "#f3c854" };
    case "default":
      return { base: "#274c46", foreground: "#f3f7f4", accent: "#93d7c0" };
    case "neon":
    default:
      return { base: "#111827", foreground: "#fdf2f8", accent: "#00d2ff" };
  }
}
