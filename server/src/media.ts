import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";
import sharp from "sharp";
import { projectsRoot } from "./storage.js";
import type { Project, ProjectImage } from "./types.js";

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

export function sendFile(response: ServerResponse, filePath: string, contentType: string, size: number) {
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": size,
    "Content-Type": contentType,
  });
  createReadStream(filePath).pipe(response);
}

export function imageContentType(fileName: string) {
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

export function imageIdFromFileName(fileName: string) {
  return path.parse(fileName).name;
}

export async function ensureThumbnail(project: Project, fileName: string) {
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

export async function nextImageIndex(project: Project) {
  await ensureProjectMediaFolders(project);

  const files = await readdir(getImagesFolder(project));
  const indexes = files
    .map((file) => Number.parseInt(path.parse(file).name, 10))
    .filter(Number.isFinite);

  return Math.max(0, ...indexes) + 1;
}

export async function listProjectImages(project: Project): Promise<ProjectImage[]> {
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

export async function resolveImagePath(
  project: Project,
  imageId: string,
  variant: "original" | "thumbnail"
) {
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

export async function deleteProjectImage(project: Project, imageId: string) {
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

export async function deleteAllProjectImages(project: Project) {
  await rm(getImagesFolder(project), { force: true, recursive: true });
  await rm(getThumbnailsFolder(project), { force: true, recursive: true });
  await ensureProjectMediaFolders(project);
}
