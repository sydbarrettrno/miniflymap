import type { SavedProject } from "../domain/models";

const STORAGE_KEY = "nv_drone_projects_v2";
const MAX_PROJECTS = 50;

export function loadProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedProject).slice(0, MAX_PROJECTS);
  } catch {
    return [];
  }
}

export function saveProject(project: SavedProject): SavedProject[] {
  const projects = loadProjects().filter((item) => item.name.toLocaleLowerCase() !== project.name.toLocaleLowerCase());
  projects.unshift(project);
  const next = projects.slice(0, MAX_PROJECTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteProject(name: string): SavedProject[] {
  const next = loadProjects().filter((item) => item.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function isSavedProject(value: unknown): value is SavedProject {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedProject>;
  return typeof item.name === "string" && Array.isArray(item.boundary) && typeof item.savedAtMs === "number" && !!item.settings;
}
