import { createWriteStream } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import sharp from "sharp";
import {
  ensureProjectMediaFolders,
  getImagesFolder,
  getThumbnailsFolder,
  listProjectImages,
  nextImageIndex,
} from "./media.js";
import type { Project } from "./types.js";

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

  let index = await nextImageIndex(project);
  const uploads: Promise<void>[] = [];
  const parser = busboy({
    headers: request.headers,
    limits: {
      fileSize: maxImageUploadSize,
      files: 100,
    },
  });

  return await new Promise((resolve, reject) => {
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
