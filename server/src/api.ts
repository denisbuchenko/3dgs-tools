import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { uploadProjectImages } from "./imLoader.js";
import {
  getColmapJob,
  getColmapResult,
  getDefaultColmapSettings,
  resolveColmapPly,
  startColmapJob,
} from "./colmap.js";
import {
  deleteAllProjectImages,
  deleteProjectImage,
  ensureProjectMediaFolders,
  listProjectImages,
  resolveImagePath,
  sendFile,
} from "./media.js";
import { getProjectById, projectsRoot, readProjects, writeProjects } from "./storage.js";
import type { Project, ProjectInput } from "./types.js";
import { uploadProjectVideo } from "./videoLoader.js";

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Expires": "0",
    "Pragma": "no-cache",
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(response: ServerResponse) {
  response.writeHead(204, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Expires": "0",
    "Pragma": "no-cache",
  });
  response.end();
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const content = Buffer.concat(chunks).toString("utf8").trim();

  if (!content) {
    return {};
  }

  return JSON.parse(content);
}

function normalizeInput(input: ProjectInput) {
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

function createUniqueFolderName(title: string, projects: Project[], currentId?: string) {
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

function getProjectId(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProjectImagesRoute(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/images$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProjectVideosRoute(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/videos$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProjectColmapRoute(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/colmap$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProjectColmapDefaultsRoute(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/colmap\/defaults$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProjectColmapResultRoute(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/colmap\/result$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProjectColmapPlyRoute(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/colmap\/points\.ply$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProjectImageFileRoute(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/images\/([^/]+)\/(original|thumbnail)$/);

  if (!match) {
    return null;
  }

  return {
    projectId: decodeURIComponent(match[1]),
    imageId: decodeURIComponent(match[2]),
    variant: match[3] as "original" | "thumbnail",
  };
}

function getProjectImageRoute(pathname: string) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/images\/([^/]+)$/);

  if (!match) {
    return null;
  }

  return {
    projectId: decodeURIComponent(match[1]),
    imageId: decodeURIComponent(match[2]),
  };
}

export async function handleApi(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  if (url.pathname === "/api/projects" && request.method === "GET") {
    sendJson(response, 200, await readProjects());
    return;
  }

  if (url.pathname === "/api/projects" && request.method === "POST") {
    const input = normalizeInput((await readBody(request)) as ProjectInput);
    const projects = await readProjects();
    const now = new Date().toISOString();
    const folderName = createUniqueFolderName(input.title, projects);
    const project: Project = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      folderName,
      createdAt: now,
      updatedAt: now,
    };

    await mkdir(path.join(projectsRoot, folderName), { recursive: false });
    await ensureProjectMediaFolders(project);
    await writeProjects([project, ...projects]);
    sendJson(response, 201, project);
    return;
  }

  const projectImagesId = getProjectImagesRoute(url.pathname);
  const projectVideosId = getProjectVideosRoute(url.pathname);
  const projectColmapId = getProjectColmapRoute(url.pathname);
  const projectColmapDefaultsId = getProjectColmapDefaultsRoute(url.pathname);
  const projectColmapResultId = getProjectColmapResultRoute(url.pathname);
  const projectColmapPlyId = getProjectColmapPlyRoute(url.pathname);

  if (projectColmapDefaultsId && request.method === "GET") {
    sendJson(response, 200, getDefaultColmapSettings());
    return;
  }

  if (projectColmapId && request.method === "GET") {
    sendJson(response, 200, getColmapJob(projectColmapId));
    return;
  }

  if (projectColmapId && request.method === "POST") {
    const { project } = await getProjectById(projectColmapId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    const body = (await readBody(request)) as { settings?: unknown };
    const job = startColmapJob(project, (body.settings ?? {}) as Parameters<typeof startColmapJob>[1]);
    sendJson(response, 202, job);
    return;
  }

  if (projectColmapResultId && request.method === "GET") {
    const { project } = await getProjectById(projectColmapResultId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    sendJson(response, 200, await getColmapResult(project));
    return;
  }

  if (projectColmapPlyId && request.method === "GET") {
    const { project } = await getProjectById(projectColmapPlyId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    const ply = await resolveColmapPly(project);
    sendFile(response, ply.path, "model/ply", ply.size, "no-store");
    return;
  }

  if (projectImagesId && request.method === "GET") {
    const { project } = await getProjectById(projectImagesId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    sendJson(response, 200, await listProjectImages(project));
    return;
  }

  if (projectImagesId && request.method === "POST") {
    const { project, projects } = await getProjectById(projectImagesId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    const images = await uploadProjectImages(request, project);
    const updatedProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    };

    await writeProjects(
      projects.map((item) => (item.id === project.id ? updatedProject : item))
    );
    sendJson(response, 201, images);
    return;
  }

  if (projectImagesId && request.method === "DELETE") {
    const { project, projects } = await getProjectById(projectImagesId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    await deleteAllProjectImages(project);

    const updatedProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    };

    await writeProjects(
      projects.map((item) => (item.id === project.id ? updatedProject : item))
    );
    sendNoContent(response);
    return;
  }

  if (projectVideosId && request.method === "POST") {
    const { project, projects } = await getProjectById(projectVideosId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    const images = await uploadProjectVideo(request, project);
    const updatedProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    };

    await writeProjects(
      projects.map((item) => (item.id === project.id ? updatedProject : item))
    );
    sendJson(response, 201, images);
    return;
  }

  const imageFileRoute = getProjectImageFileRoute(url.pathname);

  if (imageFileRoute && request.method === "GET") {
    const { project } = await getProjectById(imageFileRoute.projectId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    const image = await resolveImagePath(
      project,
      imageFileRoute.imageId,
      imageFileRoute.variant
    );

    if (!image) {
      sendJson(response, 404, { message: "Изображение не найдено." });
      return;
    }

    sendFile(response, image.path, image.contentType, image.size, "no-store");
    return;
  }

  const imageRoute = getProjectImageRoute(url.pathname);

  if (imageRoute && request.method === "DELETE") {
    const { project, projects } = await getProjectById(imageRoute.projectId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    const deleted = await deleteProjectImage(project, imageRoute.imageId);

    if (!deleted) {
      sendJson(response, 404, { message: "Изображение не найдено." });
      return;
    }

    const updatedProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    };

    await writeProjects(
      projects.map((item) => (item.id === project.id ? updatedProject : item))
    );
    sendNoContent(response);
    return;
  }

  const projectId = getProjectId(url.pathname);

  if (projectId && request.method === "PATCH") {
    const input = normalizeInput((await readBody(request)) as ProjectInput);
    const projects = await readProjects();
    const project = projects.find((item) => item.id === projectId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    const folderName = createUniqueFolderName(input.title, projects, projectId);
    const updatedProject: Project = {
      ...project,
      title: input.title,
      description: input.description,
      folderName,
      updatedAt: new Date().toISOString(),
    };

    if (folderName !== project.folderName) {
      await rename(path.join(projectsRoot, project.folderName), path.join(projectsRoot, folderName));
    }

    await writeProjects(
      projects.map((item) => (item.id === projectId ? updatedProject : item))
    );
    sendJson(response, 200, updatedProject);
    return;
  }

  if (projectId && request.method === "DELETE") {
    const projects = await readProjects();
    const project = projects.find((item) => item.id === projectId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return;
    }

    await rm(path.join(projectsRoot, project.folderName), { force: true, recursive: true });
    await writeProjects(projects.filter((item) => item.id !== projectId));
    sendNoContent(response);
    return;
  }

  sendJson(response, 404, { message: "Маршрут не найден." });
}

export function handleApiError(response: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера.";
  sendJson(response, 400, { message });
}
