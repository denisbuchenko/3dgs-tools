import type { Project, ProjectInput } from "../types.js";

export function normalizeProjectInput(input: ProjectInput) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";

  if (!title) {
    throw new Error("Название проекта обязательно.");
  }

  return {
    title,
    description,
  };
}

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}

export function createUniqueFolderName(title: string, projects: Project[], currentId?: string) {
  const base = slugify(title);
  const used = new Set(
    projects
      .filter((project) => project.id !== currentId)
      .map((project) => project.folderName.toLowerCase())
  );

  if (!used.has(base.toLowerCase())) {
    return base;
  }

  let index = 2;
  let candidate = `${base}-${index}`;

  while (used.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${base}-${index}`;
  }

  return candidate;
}
