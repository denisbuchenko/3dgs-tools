import { mkdir } from "node:fs/promises";
import path from "node:path";
import { projectsRoot } from "../storage.js";
import type { Project } from "../types.js";

export function getProjectFolder(project: Project) {
  return path.join(projectsRoot, project.folderName);
}

export function getImagesFolder(project: Project) {
  return path.join(getProjectFolder(project), "images");
}

export function getThumbnailsFolder(project: Project) {
  return path.join(getProjectFolder(project), "thumbnails");
}

export async function ensureProjectMediaFolders(project: Project) {
  await mkdir(getImagesFolder(project), { recursive: true });
  await mkdir(getThumbnailsFolder(project), { recursive: true });
}
