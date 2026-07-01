import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import { deleteAllProjectImages, listProjectImages } from "./images.js";
import { ensureProjectMediaFolders, getImagesFolder } from "./paths.js";
import { ensureThumbnail, imageIdFromFileName } from "./thumbnails.js";
import { normalizeVideoOptions, type VideoFields } from "./videoOptions.js";
import type { Project, ProjectImage } from "../types.js";

const maxVideoUploadSize = 2 * 1024 * 1024 * 1024;
const supportedVideoExtensions = new Set([".mov"]);
const supportedVideoMimeTypes = new Set(["video/quicktime", "video/x-quicktime"]);

function isSupportedVideoUpload(mimeType: string, filename: string) {
  const extension = path.extname(filename).toLowerCase();

  return (
    mimeType.startsWith("video/") ||
    supportedVideoMimeTypes.has(mimeType.toLowerCase()) ||
    supportedVideoExtensions.has(extension)
  );
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

export async function uploadProjectVideo(
  request: IncomingMessage,
  project: Project
): Promise<ProjectImage[]> {
  await ensureProjectMediaFolders(project);

  const fields: VideoFields = {};
  const uploadId = randomUUID();
  const tempVideoPath = path.join(tmpdir(), `3dgs-video-${uploadId}`);
  const tempFramesFolder = path.join(tmpdir(), `3dgs-video-frames-${uploadId}`);
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
      if (!isSupportedVideoUpload(info.mimeType, info.filename)) {
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
          await mkdir(tempFramesFolder, { recursive: true });
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
            "1",
            path.join(tempFramesFolder, `${uploadId}-%04d.jpg`)
          );

          await runFfmpeg(ffmpegArgs);

          const files = await readdir(tempFramesFolder);
          const createdIds = files
            .map((file) => imageIdFromFileName(file))
            .filter((id) => id.startsWith(`${uploadId}-`))
            .sort((a, b) => a.localeCompare(b));

          if (createdIds.length === 0) {
            throw new Error(`Из видео "${originalName}" не удалось извлечь кадры.`);
          }

          await deleteAllProjectImages(project);
          await Promise.all(
            files.map((fileName) =>
              rename(path.join(tempFramesFolder, fileName), path.join(getImagesFolder(project), fileName))
            )
          );
          await createThumbnailsForImages(project, createdIds);
          await rm(tempVideoPath, { force: true });
          await rm(tempFramesFolder, { force: true, recursive: true });

          return listProjectImages(project);
        })
        .then(resolve)
        .catch(async (error: unknown) => {
          await rm(tempVideoPath, { force: true });
          await rm(tempFramesFolder, { force: true, recursive: true });
          reject(error);
        });
    });

    request.pipe(parser);
  });
}
