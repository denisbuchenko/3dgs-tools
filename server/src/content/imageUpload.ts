import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import sharp from "sharp";
import { deleteAllProjectImages, listProjectImages } from "./images.js";
import { ensureProjectMediaFolders, getImagesFolder, getThumbnailsFolder } from "./paths.js";
import type { Project } from "../types.js";

const maxImageUploadSize = 50 * 1024 * 1024;

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

export async function uploadProjectImages(request: IncomingMessage, project: Project) {
  await ensureProjectMediaFolders(project);

  const uploadId = randomUUID();
  const tempImagesFolder = path.join(tmpdir(), `3dgs-images-${uploadId}`);
  const tempThumbnailsFolder = path.join(tmpdir(), `3dgs-thumbnails-${uploadId}`);
  let index = 1;
  const uploads: Promise<void>[] = [];
  const parser = busboy({
    headers: request.headers,
    limits: {
      fileSize: maxImageUploadSize,
      files: 100,
    },
  });

  return await new Promise((resolve, reject) => {
    const prepareFolders = mkdir(tempImagesFolder, { recursive: true }).then(() =>
      mkdir(tempThumbnailsFolder, { recursive: true })
    );

    parser.on("file", (_fieldName, file, info) => {
      if (!info.mimeType.startsWith("image/")) {
        file.resume();
        return;
      }

      const id = String(index).padStart(4, "0");
      index += 1;

      const imageId = `${uploadId}-${id}`;
      const fileName = `${imageId}${imageExtension(info.mimeType, info.filename)}`;
      const thumbnailName = `${imageId}.webp`;
      const imagePath = path.join(tempImagesFolder, fileName);
      const thumbnailPath = path.join(tempThumbnailsFolder, thumbnailName);

      uploads.push(
        prepareFolders.then(() => pipeline(file, createWriteStream(imagePath))).then(async () => {
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
        .then(async () => {
          if (uploads.length === 0) {
            throw new Error("Изображения не выбраны.");
          }

          const imageFiles = await readdir(tempImagesFolder);
          const thumbnailFiles = await readdir(tempThumbnailsFolder);

          await deleteAllProjectImages(project);
          await Promise.all([
            ...imageFiles.map((fileName) =>
              rename(path.join(tempImagesFolder, fileName), path.join(getImagesFolder(project), fileName))
            ),
            ...thumbnailFiles.map((fileName) =>
              rename(
                path.join(tempThumbnailsFolder, fileName),
                path.join(getThumbnailsFolder(project), fileName)
              )
            ),
          ]);
          await rm(tempImagesFolder, { force: true, recursive: true });
          await rm(tempThumbnailsFolder, { force: true, recursive: true });

          return listProjectImages(project);
        })
        .then(resolve)
        .catch(async (error: unknown) => {
          await rm(tempImagesFolder, { force: true, recursive: true });
          await rm(tempThumbnailsFolder, { force: true, recursive: true });
          reject(error);
        });
    });

    request.pipe(parser);
  });
}
