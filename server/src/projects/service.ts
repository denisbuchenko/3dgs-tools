import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { ensureProjectMediaFolders } from "../content/index.js";
import { projectsRoot, readProjects, writeProjects } from "../storage.js";
import type { Project, ProjectInput } from "../types.js";
import { createUniqueFolderName, normalizeProjectInput } from "./names.js";

export async function createProject(input: ProjectInput) {
  const normalized = normalizeProjectInput(input);
  const projects = await readProjects();
  const now = new Date().toISOString();
  const folderName = createUniqueFolderName(normalized.title, projects);
  const project: Project = {
    id: randomUUID(),
    title: normalized.title,
    description: normalized.description,
    folderName,
    createdAt: now,
    updatedAt: now,
  };

  await mkdir(path.join(projectsRoot, folderName), { recursive: false });
  await ensureProjectMediaFolders(project);
  await writeProjects([project, ...projects]);

  return project;
}

export async function updateProject(projectId: string, input: ProjectInput) {
  const normalized = normalizeProjectInput(input);
  const projects = await readProjects();
  const project = projects.find((item) => item.id === projectId);

  if (!project) {
    return null;
  }

  const folderName = createUniqueFolderName(normalized.title, projects, projectId);
  const updatedProject: Project = {
    ...project,
    title: normalized.title,
    description: normalized.description,
    folderName,
    updatedAt: new Date().toISOString(),
  };

  if (folderName !== project.folderName) {
    await rename(path.join(projectsRoot, project.folderName), path.join(projectsRoot, folderName));
  }

  await writeProjects(projects.map((item) => (item.id === projectId ? updatedProject : item)));

  return updatedProject;
}

export async function deleteProject(projectId: string) {
  const projects = await readProjects();
  const project = projects.find((item) => item.id === projectId);

  if (!project) {
    return false;
  }

  await rm(path.join(projectsRoot, project.folderName), { force: true, recursive: true });
  await writeProjects(projects.filter((item) => item.id !== projectId));

  return true;
}

export async function touchProject(project: Project, projects: Project[]) {
  const updatedProject = {
    ...project,
    updatedAt: new Date().toISOString(),
  };

  await writeProjects(projects.map((item) => (item.id === project.id ? updatedProject : item)));

  return updatedProject;
}
