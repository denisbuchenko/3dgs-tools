import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ColmapLivePreview, ColmapPreviewPoint } from "../types.js";
import type { ColmapJob } from "./jobState.js";

const maxPreviewPoints = 1800;

export function startSparsePreviewPoller(job: ColmapJob, modelPath: string | null, intervalMs = 3500) {
  if (!modelPath) {
    return { stop: () => undefined };
  }

  let stopped = false;
  let isPolling = false;
  const timer = setInterval(() => {
    if (stopped || isPolling) {
      return;
    }

    isPolling = true;
    readSparsePreview(modelPath)
      .then((preview) => {
        if (preview) {
          job.preview = preview;
          job.metrics.mapperPoints = Math.max(job.metrics.mapperPoints, preview.totalPoints);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        isPolling = false;
      });
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

async function readSparsePreview(modelPath: string): Promise<ColmapLivePreview | null> {
  const pointsPath = path.join(modelPath, "points3D.bin");
  const buffer = await readFile(pointsPath);

  if (buffer.byteLength < 8) {
    return null;
  }

  const totalPoints = Number(buffer.readBigUInt64LE(0));
  const points: ColmapPreviewPoint[] = [];
  const stride = Math.max(1, Math.floor(totalPoints / maxPreviewPoints));
  let offset = 8;

  for (let index = 0; index < totalPoints && offset + 43 <= buffer.byteLength; index += 1) {
    offset += 8;
    const x = buffer.readDoubleLE(offset);
    const y = buffer.readDoubleLE(offset + 8);
    const z = buffer.readDoubleLE(offset + 16);
    offset += 24;
    const color: [number, number, number] = [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
    offset += 3;
    offset += 8;

    if (index % stride === 0 && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      points.push({ position: [x, y, z], color });
    }

    const trackLength = Number(buffer.readBigUInt64LE(offset));
    offset += 8 + trackLength * 8;
  }

  return {
    totalPoints,
    points,
    updatedAt: new Date().toISOString(),
  };
}
