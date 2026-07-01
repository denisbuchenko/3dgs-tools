import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { ensureProjectMediaFolders, getImagesFolder, getThumbnailsFolder } from "./paths.js";
import {
  ensureThumbnail,
  imageContentType,
  imageIdFromFileName,
  isSafeImageId,
} from "./thumbnails.js";
import type { Project, ProjectImage } from "../types.js";

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
        const thumbnailStat = await stat(path.join(getThumbnailsFolder(project), `${id}.webp`));
        const originalVersion = `${Math.round(fileStat.mtimeMs)}-${fileStat.size}`;
        const thumbnailVersion = `${Math.round(thumbnailStat.mtimeMs)}-${thumbnailStat.size}`;

        return {
          id,
          fileName,
          thumbnailName: `${id}.webp`,
          originalUrl: `/api/projects/${encodeURIComponent(project.id)}/images/${id}/original?v=${originalVersion}`,
          thumbnailUrl: `/api/projects/${encodeURIComponent(project.id)}/images/${id}/thumbnail?v=${thumbnailVersion}`,
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

  if (!isSafeImageId(imageId)) {
    return null;
  }

  const files = await readdir(getImagesFolder(project));
  const fileName = files.find((file) => imageIdFromFileName(file) === imageId);

  if (!fileName) {
    return null;
  }

  if (variant === "thumbnail") {
    const thumbnailPath = path.join(getThumbnailsFolder(project), `${imageId}.webp`);

    await ensureThumbnail(project, fileName);

    const thumbnailStat = await stat(thumbnailPath);

    return {
      path: thumbnailPath,
      size: thumbnailStat.size,
      contentType: "image/webp",
    };
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

  if (!isSafeImageId(imageId)) {
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
