import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "./types.js";

export const serverRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const projectsRoot = path.join(serverRoot, "projects");
export const metadataPath = path.join(projectsRoot, "projects.json");

export async function ensureStorage() {
  await mkdir(projectsRoot, { recursive: true });

  try {
    await readFile(metadataPath, "utf8");
  } catch {
    await writeFile(metadataPath, "[]\n", "utf8");
  }
}

export async function readProjects(): Promise<Project[]> {
  await ensureStorage();

  const content = await readFile(metadataPath, "utf8");
  const projects = JSON.parse(content) as Project[];

  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function writeProjects(projects: Project[]) {
  await writeFile(metadataPath, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
}

export async function getProjectById(projectId: string) {
  const projects = await readProjects();
  const project = projects.find((item) => item.id === projectId);

  return {
    project,
    projects,
  };
}
