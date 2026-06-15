import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import busboy from "busboy";
import sharp from "sharp";

type Project = {
  id: string;
  title: string;
  description: string;
  folderName: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectInput = {
  title?: unknown;
  description?: unknown;
};

type ProjectImage = {
  id: string;
  fileName: string;
  thumbnailName: string;
  originalUrl: string;
  thumbnailUrl: string;
  size: number;
  createdAt: string;
};

type VideoFields = {
  fps?: string;
  scalePercent?: string;
  startSecond?: string;
  endSecond?: string;
};

type VideoOptions = {
  fps: number;
  scalePercent: number;
  startSecond: number;
  endSecond: number | null;
};

const port = Number(process.env.PORT) || 3000;
const serverRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectsRoot = path.join(serverRoot, "projects");
const metadataPath = path.join(projectsRoot, "projects.json");
const maxImageUploadSize = 50 * 1024 * 1024;
const maxVideoUploadSize = 2 * 1024 * 1024 * 1024;

async function ensureStorage() {
  await mkdir(projectsRoot, { recursive: true });

  try {
    await readFile(metadataPath, "utf8");
  } catch {
    await writeFile(metadataPath, "[]\n", "utf8");
  }
}

async function readProjects(): Promise<Project[]> {
  await ensureStorage();

  const content = await readFile(metadataPath, "utf8");
  const projects = JSON.parse(content) as Project[];

  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function writeProjects(projects: Project[]) {
  await writeFile(metadataPath, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
}

function getProjectFolder(project: Project) {
  return path.join(projectsRoot, project.folderName);
}

function getImagesFolder(project: Project) {
  return path.join(getProjectFolder(project), "images");
}

function getThumbnailsFolder(project: Project) {
  return path.join(getProjectFolder(project), "thumbnails");
}

async function ensureProjectMediaFolders(project: Project) {
  await mkdir(getImagesFolder(project), { recursive: true });
  await mkdir(getThumbnailsFolder(project), { recursive: true });
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(response: ServerResponse) {
  response.writeHead(204, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
  });
  response.end();
}

function sendFile(response: ServerResponse, filePath: string, contentType: string, size: number) {
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": size,
    "Content-Type": contentType,
  });
  createReadStream(filePath).pipe(response);
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

function imageExtension(mimeType: string, filename: string) {
  const byMime: Record<string, string> = {
    "image/avif": ".avif",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  const extension = byMime[mimeType] ?? path.extname(filename).toLowerCase();

  return [".avif", ".gif", ".jpg", ".jpeg", ".png", ".webp"].includes(extension)
    ? extension
    : ".jpg";
}

function imageContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".avif") {
    return "image/avif";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function imageIdFromFileName(fileName: string) {
  return path.parse(fileName).name;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVideoOptions(fields: VideoFields): VideoOptions {
  const fps = Math.round(clamp(Number(fields.fps) || 1, 1, 30));
  const scalePercent = clamp(Number(fields.scalePercent) || 100, 1, 100);
  const startSecond = Math.max(0, Number(fields.startSecond) || 0);
  const rawEndSecond = Number(fields.endSecond);
  const endSecond =
    Number.isFinite(rawEndSecond) && rawEndSecond > startSecond ? rawEndSecond : null;

  return {
    fps,
    scalePercent,
    startSecond,
    endSecond,
  };
}

async function ensureThumbnail(project: Project, fileName: string) {
  const id = imageIdFromFileName(fileName);
  const imagePath = path.join(getImagesFolder(project), fileName);
  const thumbnailPath = path.join(getThumbnailsFolder(project), `${id}.webp`);

  try {
    await stat(thumbnailPath);
  } catch {
    await sharp(imagePath)
      .rotate()
      .resize({ width: 360, height: 260, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(thumbnailPath);
  }
}

async function nextImageIndex(project: Project) {
  await ensureProjectMediaFolders(project);

  const files = await readdir(getImagesFolder(project));
  const indexes = files
    .map((file) => Number.parseInt(path.parse(file).name, 10))
    .filter(Number.isFinite);

  return Math.max(0, ...indexes) + 1;
}

async function listProjectImages(project: Project): Promise<ProjectImage[]> {
  await ensureProjectMediaFolders(project);

  const files = await readdir(getImagesFolder(project));
  const images = await Promise.all(
    files
      .filter((file) => !file.startsWith("."))
      .sort((a, b) => a.localeCompare(b))
      .map(async (fileName) => {
        await ensureThumbnail(project, fileName);

        const filePath = path.join(getImagesFolder(project), fileName);
        const fileStat = await stat(filePath);
        const id = imageIdFromFileName(fileName);

        return {
          id,
          fileName,
          thumbnailName: `${id}.webp`,
          originalUrl: `/api/projects/${encodeURIComponent(project.id)}/images/${id}/original`,
          thumbnailUrl: `/api/projects/${encodeURIComponent(project.id)}/images/${id}/thumbnail`,
          size: fileStat.size,
          createdAt: fileStat.birthtime.toISOString(),
        };
      })
  );

  return images;
}

async function getProjectById(projectId: string) {
  const projects = await readProjects();
  const project = projects.find((item) => item.id === projectId);

  return {
    project,
    projects,
  };
}

async function resolveImagePath(project: Project, imageId: string, variant: "original" | "thumbnail") {
  await ensureProjectMediaFolders(project);

  if (!/^\d+$/.test(imageId)) {
    return null;
  }

  if (variant === "thumbnail") {
    const thumbnailPath = path.join(getThumbnailsFolder(project), `${imageId}.webp`);
    const files = await readdir(getImagesFolder(project));
    const fileName = files.find((file) => imageIdFromFileName(file) === imageId);

    if (!fileName) {
      return null;
    }

    await ensureThumbnail(project, fileName);

    const thumbnailStat = await stat(thumbnailPath);

    return {
      path: thumbnailPath,
      size: thumbnailStat.size,
      contentType: "image/webp",
    };
  }

  const files = await readdir(getImagesFolder(project));
  const fileName = files.find((file) => imageIdFromFileName(file) === imageId);

  if (!fileName) {
    return null;
  }

  const imagePath = path.join(getImagesFolder(project), fileName);
  const imageStat = await stat(imagePath);

  return {
    path: imagePath,
    size: imageStat.size,
    contentType: imageContentType(fileName),
  };
}

async function deleteProjectImage(project: Project, imageId: string) {
  await ensureProjectMediaFolders(project);

  if (!/^\d+$/.test(imageId)) {
    return false;
  }

  const files = await readdir(getImagesFolder(project));
  const fileName = files.find((file) => imageIdFromFileName(file) === imageId);

  if (!fileName) {
    return false;
  }

  await rm(path.join(getImagesFolder(project), fileName), { force: true });
  await rm(path.join(getThumbnailsFolder(project), `${imageId}.webp`), { force: true });

  return true;
}

async function deleteAllProjectImages(project: Project) {
  await rm(getImagesFolder(project), { force: true, recursive: true });
  await rm(getThumbnailsFolder(project), { force: true, recursive: true });
  await ensureProjectMediaFolders(project);
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args);
    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || "ffmpeg не смог обработать видео."));
    });
  });
}

async function createThumbnailsForImages(project: Project, imageIds: string[]) {
  const files = await readdir(getImagesFolder(project));

  await Promise.all(
    imageIds.map(async (imageId) => {
      const fileName = files.find((file) => imageIdFromFileName(file) === imageId);

      if (fileName) {
        await ensureThumbnail(project, fileName);
      }
    })
  );
}

async function uploadProjectImages(request: IncomingMessage, project: Project) {
  await ensureProjectMediaFolders(project);

  let index = await nextImageIndex(project);
  const uploads: Promise<void>[] = [];
  const parser = busboy({
    headers: request.headers,
    limits: {
      fileSize: maxImageUploadSize,
      files: 100,
    },
  });

  return await new Promise<ProjectImage[]>((resolve, reject) => {
    parser.on("file", (_fieldName, file, info) => {
      if (!info.mimeType.startsWith("image/")) {
        file.resume();
        return;
      }

      const id = String(index).padStart(4, "0");
      index += 1;

      const fileName = `${id}${imageExtension(info.mimeType, info.filename)}`;
      const thumbnailName = `${id}.webp`;
      const imagePath = path.join(getImagesFolder(project), fileName);
      const thumbnailPath = path.join(getThumbnailsFolder(project), thumbnailName);

      uploads.push(
        pipeline(file, createWriteStream(imagePath)).then(async () => {
          await sharp(imagePath)
            .rotate()
            .resize({ width: 360, height: 260, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 72 })
            .toFile(thumbnailPath);
        })
      );
    });

    parser.on("error", reject);
    parser.on("finish", () => {
      Promise.all(uploads)
        .then(() => listProjectImages(project))
        .then(resolve)
        .catch(reject);
    });

    request.pipe(parser);
  });
}

async function uploadProjectVideo(request: IncomingMessage, project: Project) {
  await ensureProjectMediaFolders(project);

  const fields: VideoFields = {};
  const tempVideoPath = path.join(tmpdir(), `3dgs-video-${randomUUID()}`);
  let hasVideo = false;
  let originalName = "video";

  const parser = busboy({
    headers: request.headers,
    limits: {
      fileSize: maxVideoUploadSize,
      files: 1,
    },
  });

  return await new Promise<ProjectImage[]>((resolve, reject) => {
    const uploads: Promise<void>[] = [];

    parser.on("field", (name, value) => {
      if (["fps", "scalePercent", "startSecond", "endSecond"].includes(name)) {
        fields[name as keyof VideoFields] = value;
      }
    });

    parser.on("file", (_fieldName, file, info) => {
      if (!info.mimeType.startsWith("video/")) {
        file.resume();
        return;
      }

      hasVideo = true;
      originalName = info.filename || originalName;
      uploads.push(pipeline(file, createWriteStream(tempVideoPath)));
    });

    parser.on("error", reject);
    parser.on("finish", () => {
      Promise.all(uploads)
        .then(async () => {
          if (!hasVideo) {
            throw new Error("Видео не выбрано.");
          }

          const options = normalizeVideoOptions(fields);
          const startIndex = await nextImageIndex(project);
          const outputPattern = path.join(getImagesFolder(project), "%04d.jpg");
          const ffmpegArgs = [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            String(options.startSecond),
            "-i",
            tempVideoPath,
          ];

          if (options.endSecond !== null) {
            ffmpegArgs.push("-t", String(options.endSecond - options.startSecond));
          }

          ffmpegArgs.push(
            "-vf",
            `fps=${options.fps},scale=max(2\\,trunc(iw*${options.scalePercent}/100/2)*2):max(2\\,trunc(ih*${options.scalePercent}/100/2)*2)`,
            "-q:v",
            "2",
            "-start_number",
            String(startIndex),
            outputPattern
          );

          await runFfmpeg(ffmpegArgs);

          const files = await readdir(getImagesFolder(project));
          const createdIds = files
            .map((file) => imageIdFromFileName(file))
            .filter((id) => /^\d+$/.test(id) && Number(id) >= startIndex)
            .sort((a, b) => a.localeCompare(b));

          await createThumbnailsForImages(project, createdIds);
          await rm(tempVideoPath, { force: true });

          if (createdIds.length === 0) {
            throw new Error(`Из видео "${originalName}" не удалось извлечь кадры.`);
          }

          return listProjectImages(project);
        })
        .then(resolve)
        .catch(async (error: unknown) => {
          await rm(tempVideoPath, { force: true });
          reject(error);
        });
    });

    request.pipe(parser);
  });
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

async function handleProjects(request: IncomingMessage, response: ServerResponse) {
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

    sendFile(response, image.path, image.contentType, image.size);
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

const server = createServer((request, response) => {
  handleProjects(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера.";
    sendJson(response, 400, { message });
  });
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
