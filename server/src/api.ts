import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getColmapJob,
  getColmapResult,
  getDefaultColmapSettings,
  resolveColmapPly,
  resolveColmapLivePly,
  startColmapJob,
} from "./colmap/index.js";
import {
  deleteAllProjectImages,
  deleteProjectImage,
  listProjectImages,
  resolveImagePath,
  sendFile,
  uploadProjectImages,
  uploadProjectVideo,
} from "./content/index.js";
import {
  getProjectColmapDefaultsRoute,
  getProjectColmapLivePlyRoute,
  getProjectColmapPlyRoute,
  getProjectColmapResultRoute,
  getProjectColmapRoute,
  getProjectGsplatDefaultsRoute,
  getProjectGsplatPlyRoute,
  getProjectGsplatResultRoute,
  getProjectGsplatRoute,
  getProjectGsplatStatusRoute,
  getProjectId,
  getProjectImageFileRoute,
  getProjectImageRoute,
  getProjectImagesRoute,
  getProjectVideosRoute,
} from "./api/routes.js";
import { readBody, sendJson, sendNoContent } from "./api/http.js";
import {
  getDefaultGsplatSettings,
  getGsplatJob,
  getGsplatResult,
  getGsplatTrainerStatus,
  resolveGsplatPly,
  startGsplatJob,
} from "./gaussian-splat/index.js";
import { createProject, deleteProject, touchProject, updateProject } from "./projects/index.js";
import { getProjectById, readProjects } from "./storage.js";
import type { ProjectInput } from "./types.js";

export async function handleApi(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  if (url.pathname === "/api/projects") {
    await handleProjectsCollection(request, response);
    return;
  }

  if (await handleColmapRoutes(request, response, url.pathname)) {
    return;
  }

  if (await handleGsplatRoutes(request, response, url.pathname)) {
    return;
  }

  if (await handleContentRoutes(request, response, url.pathname)) {
    return;
  }

  if (await handleProjectRoutes(request, response, url.pathname)) {
    return;
  }

  sendJson(response, 404, { message: "Маршрут не найден." });
}

async function handleProjectsCollection(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "GET") {
    sendJson(response, 200, await readProjects());
    return;
  }

  if (request.method === "POST") {
    const project = await createProject((await readBody(request)) as ProjectInput);
    sendJson(response, 201, project);
    return;
  }

  sendJson(response, 404, { message: "Маршрут не найден." });
}

async function handleColmapRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
) {
  const defaultsId = getProjectColmapDefaultsRoute(pathname);
  const colmapId = getProjectColmapRoute(pathname);
  const resultId = getProjectColmapResultRoute(pathname);
  const plyId = getProjectColmapPlyRoute(pathname);
  const livePlyId = getProjectColmapLivePlyRoute(pathname);

  if (defaultsId && request.method === "GET") {
    sendJson(response, 200, getDefaultColmapSettings());
    return true;
  }

  if (colmapId && request.method === "GET") {
    sendJson(response, 200, getColmapJob(colmapId));
    return true;
  }

  if (colmapId && request.method === "POST") {
    const { project } = await getProjectById(colmapId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const body = (await readBody(request)) as { settings?: unknown };
    const job = startColmapJob(project, (body.settings ?? {}) as Parameters<typeof startColmapJob>[1]);
    sendJson(response, 202, job);
    return true;
  }

  if (resultId && request.method === "GET") {
    const { project } = await getProjectById(resultId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    sendJson(response, 200, await getColmapResult(project));
    return true;
  }

  if (plyId && request.method === "GET") {
    const { project } = await getProjectById(plyId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const ply = await resolveColmapPly(project);
    sendFile(response, ply.path, "model/ply", ply.size, "no-store");
    return true;
  }

  if (livePlyId && request.method === "GET") {
    const { project } = await getProjectById(livePlyId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const ply = await resolveColmapLivePly(project);
    sendFile(response, ply.path, "model/ply", ply.size, "no-store");
    return true;
  }

  return false;
}

async function handleGsplatRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
) {
  const defaultsId = getProjectGsplatDefaultsRoute(pathname);
  const statusId = getProjectGsplatStatusRoute(pathname);
  const gsplatId = getProjectGsplatRoute(pathname);
  const resultId = getProjectGsplatResultRoute(pathname);
  const plyId = getProjectGsplatPlyRoute(pathname);

  if (defaultsId && request.method === "GET") {
    sendJson(response, 200, getDefaultGsplatSettings());
    return true;
  }

  if (statusId && request.method === "GET") {
    sendJson(response, 200, await getGsplatTrainerStatus());
    return true;
  }

  if (gsplatId && request.method === "GET") {
    sendJson(response, 200, getGsplatJob(gsplatId));
    return true;
  }

  if (gsplatId && request.method === "POST") {
    const { project } = await getProjectById(gsplatId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const body = (await readBody(request)) as { settings?: unknown };
    const job = startGsplatJob(project, (body.settings ?? {}) as Parameters<typeof startGsplatJob>[1]);
    sendJson(response, 202, job);
    return true;
  }

  if (resultId && request.method === "GET") {
    const { project } = await getProjectById(resultId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    sendJson(response, 200, await getGsplatResult(project));
    return true;
  }

  if (plyId && request.method === "GET") {
    const { project } = await getProjectById(plyId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const ply = await resolveGsplatPly(project);
    sendFile(response, ply.path, "model/ply", ply.size, "no-store");
    return true;
  }

  return false;
}

async function handleContentRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
) {
  const projectImagesId = getProjectImagesRoute(pathname);
  const projectVideosId = getProjectVideosRoute(pathname);

  if (projectImagesId && request.method === "GET") {
    const { project } = await getProjectById(projectImagesId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    sendJson(response, 200, await listProjectImages(project));
    return true;
  }

  if (projectImagesId && request.method === "POST") {
    const { project, projects } = await getProjectById(projectImagesId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const images = await uploadProjectImages(request, project);
    await touchProject(project, projects);
    sendJson(response, 201, images);
    return true;
  }

  if (projectImagesId && request.method === "DELETE") {
    const { project, projects } = await getProjectById(projectImagesId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    await deleteAllProjectImages(project);
    await touchProject(project, projects);
    sendNoContent(response);
    return true;
  }

  if (projectVideosId && request.method === "POST") {
    const { project, projects } = await getProjectById(projectVideosId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const images = await uploadProjectVideo(request, project);
    await touchProject(project, projects);
    sendJson(response, 201, images);
    return true;
  }

  return await handleImageFileRoutes(request, response, pathname);
}

async function handleImageFileRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
) {
  const imageFileRoute = getProjectImageFileRoute(pathname);

  if (imageFileRoute && request.method === "GET") {
    const { project } = await getProjectById(imageFileRoute.projectId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const image = await resolveImagePath(
      project,
      imageFileRoute.imageId,
      imageFileRoute.variant
    );

    if (!image) {
      sendJson(response, 404, { message: "Изображение не найдено." });
      return true;
    }

    sendFile(response, image.path, image.contentType, image.size, "no-store");
    return true;
  }

  const imageRoute = getProjectImageRoute(pathname);

  if (imageRoute && request.method === "DELETE") {
    const { project, projects } = await getProjectById(imageRoute.projectId);

    if (!project) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    const deleted = await deleteProjectImage(project, imageRoute.imageId);

    if (!deleted) {
      sendJson(response, 404, { message: "Изображение не найдено." });
      return true;
    }

    await touchProject(project, projects);
    sendNoContent(response);
    return true;
  }

  return false;
}

async function handleProjectRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
) {
  const projectId = getProjectId(pathname);

  if (projectId && request.method === "PATCH") {
    const updatedProject = await updateProject(projectId, (await readBody(request)) as ProjectInput);

    if (!updatedProject) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    sendJson(response, 200, updatedProject);
    return true;
  }

  if (projectId && request.method === "DELETE") {
    const deleted = await deleteProject(projectId);

    if (!deleted) {
      sendJson(response, 404, { message: "Проект не найден." });
      return true;
    }

    sendNoContent(response);
    return true;
  }

  return false;
}

export function handleApiError(response: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера.";
  sendJson(response, 400, { message });
}
