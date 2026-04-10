import type { IconName, TechIconName } from "../types";

export function createIcon(name: IconName, className = "icon") {
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

export function createTechIcon(name: TechIconName) {
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
    case "archive":
      return [
        { tag: "path", attributes: { ...common, d: "M4.5 8.5h15" } },
        { tag: "path", attributes: { ...common, d: "M6 8.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.5" } },
        { tag: "path", attributes: { ...common, d: "M10 12.5 12 14.5l2-2" } },
        { tag: "path", attributes: { ...common, d: "M12 10v4" } },
      ];
    case "more":
      return [
        { tag: "circle", attributes: { ...common, cx: "12", cy: "6", r: "1" } },
        { tag: "circle", attributes: { ...common, cx: "12", cy: "12", r: "1" } },
        { tag: "circle", attributes: { ...common, cx: "12", cy: "18", r: "1" } },
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
    case "node": return "Node";
    case "bun": return "Bun";
    case "pnpm": return "PNPM";
    case "yarn": return "Yarn";
    case "deno": return "Deno";
    case "rust": return "Rust";
    case "python": return "Py";
    case "go": return "Go";
    case "php": return "Php";
    case "ruby": return "Rby";
    case "dart": return "Dart";
    case "java": return "Jv";
    case "cpp": return "C++";
    case "dotnet": return "DotNet";
  }
}

export function formatTechLabel(tag: TechIconName) {
  switch (tag) {
    case "dotnet":
      return ".NET";
    case "cpp":
      return "C++";
    default:
      return tag.charAt(0).toUpperCase() + tag.slice(1);
  }
}
