import { stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getImagesFolder, getThumbnailsFolder } from "./paths.js";
import type { Project } from "../types.js";

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

export function isSafeImageId(imageId: string) {
  return /^[a-z0-9-]+$/i.test(imageId);
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
