import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import {
  ensureProjectMediaFolders,
  ensureThumbnail,
  getImagesFolder,
  imageIdFromFileName,
  listProjectImages,
  nextImageIndex,
} from "./media.js";
import type { Project, ProjectImage } from "./types.js";

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

const maxVideoUploadSize = 2 * 1024 * 1024 * 1024;

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
