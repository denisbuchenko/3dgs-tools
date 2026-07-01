import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import type { ColmapCameraPose, ColmapLivePly } from "../types.js";
import { broadcastLiveEvent } from "../realtime/websocket.js";
import { getProjectFolder } from "../content/index.js";
import { appendColmapLog, type ColmapJob } from "./jobState.js";
import type { Project } from "../types.js";

const maxLivePlyPoints = Number(process.env.COLMAP_LIVE_PLY_MAX_POINTS || 50_000);

export function startLivePlyPublisher(
  job: ColmapJob,
  projectId: string,
  modelPaths: string[],
  workspace: string,
  intervalMs = 5000
) {
  if (modelPaths.length === 0 || !projectId || !workspace) {
    return { stop: () => undefined };
  }

  let stopped = false;
  let isPublishing = false;
  let lastVersion = "";
  const tick = () => {
    if (stopped || isPublishing) {
      return;
    }

    isPublishing = true;
    publishLivePly(job, projectId, modelPaths, workspace, lastVersion)
      .then((version) => {
        if (version) {
          lastVersion = version;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        isPublishing = false;
      });
  };
  const timer = setInterval(tick, intervalMs);
  setTimeout(tick, 800);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

export async function resolveColmapLivePly(project: Project) {
  const plyPath = path.join(getProjectFolder(project), "colmap", "live-preview.ply");
  const plyStat = await stat(plyPath);

  return {
    path: plyPath,
    size: plyStat.size,
  };
}

async function publishLivePly(
  job: ColmapJob,
  projectId: string,
  modelPaths: string[],
  workspace: string,
  lastVersion: string
) {
  const latestModel = await findLatestModel(modelPaths);

  if (!latestModel) {
    return null;
  }

  const version = `${Math.round(latestModel.pointsStat.mtimeMs)}-${latestModel.pointsStat.size}`;

  if (version === lastVersion || latestModel.pointsStat.size < 16) {
    return null;
  }

  const points = await readPoints(latestModel.pointsPath);

  if (points.totalPoints === 0 || points.rows.length === 0) {
    return null;
  }

  const cameras = await readCameraPoses(path.join(latestModel.modelPath, "images.bin")).catch(() => []);
  const plyPath = path.join(workspace, "live-preview.ply");
  const tempPath = path.join(workspace, "live-preview.tmp.ply");

  await mkdir(workspace, { recursive: true });
  await writeFile(tempPath, createAsciiPly(points.rows), "utf8");
  await rename(tempPath, plyPath);

  const livePly: ColmapLivePly = {
    plyUrl: `/api/projects/${encodeURIComponent(projectId)}/colmap/live-preview.ply?v=${version}`,
    version,
    pointCount: points.rows.length,
    totalPoints: points.totalPoints,
    cameras,
    updatedAt: new Date().toISOString(),
  };

  job.livePly = livePly;
  appendColmapLog(job, `Live preview PLY updated: ${points.rows.length}/${points.totalPoints} points, ${cameras.length} cameras.`);
  broadcastLiveEvent({
    type: "colmap-live-ply",
    projectId,
    livePly,
  });

  return version;
}

async function findLatestModel(modelPaths: string[]) {
  const candidates = (await Promise.all(modelPaths.map(findModelCandidates))).flat();
  candidates.sort((a, b) => b.pointsStat.mtimeMs - a.pointsStat.mtimeMs);

  return candidates[0] ?? null;
}

async function findModelCandidates(root: string): Promise<
  Array<{
    modelPath: string;
    pointsPath: string;
    pointsStat: Stats;
  }>
> {
  const candidates = [];

  try {
    const pointsPath = path.join(root, "points3D.bin");
    const pointsStat = await stat(pointsPath);

    candidates.push({ modelPath: root, pointsPath, pointsStat });
  } catch {
    // This directory may be a parent for snapshot subdirectories.
  }

  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      candidates.push(...(await findModelCandidates(path.join(root, entry.name))));
    }
  } catch {
    return candidates;
  }

  return candidates;
}

async function readPoints(pointsPath: string) {
  const buffer = await readFile(pointsPath);
  const totalPoints = Number(buffer.readBigUInt64LE(0));
  const rows: string[] = [];
  const stride = Math.max(1, Math.ceil(totalPoints / maxLivePlyPoints));
  let offset = 8;

  for (let index = 0; index < totalPoints && offset + 43 <= buffer.byteLength; index += 1) {
    offset += 8;
    const x = buffer.readDoubleLE(offset);
    const y = buffer.readDoubleLE(offset + 8);
    const z = buffer.readDoubleLE(offset + 16);
    offset += 24;
    const r = buffer[offset];
    const g = buffer[offset + 1];
    const b = buffer[offset + 2];
    offset += 3;
    offset += 8;

    if (index % stride === 0 && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      rows.push(`${x} ${y} ${z} ${r} ${g} ${b}`);
    }

    const trackLength = Number(buffer.readBigUInt64LE(offset));
    offset += 8 + trackLength * 8;
  }

  return { rows, totalPoints };
}

async function readCameraPoses(imagesPath: string): Promise<ColmapCameraPose[]> {
  const buffer = await readFile(imagesPath);
  const count = Number(buffer.readBigUInt64LE(0));
  const cameras: ColmapCameraPose[] = [];
  let offset = 8;

  for (let index = 0; index < count && offset + 64 <= buffer.byteLength; index += 1) {
    const id = buffer.readUInt32LE(offset);
    offset += 4;
    const qw = buffer.readDoubleLE(offset);
    const qx = buffer.readDoubleLE(offset + 8);
    const qy = buffer.readDoubleLE(offset + 16);
    const qz = buffer.readDoubleLE(offset + 24);
    const tx = buffer.readDoubleLE(offset + 32);
    const ty = buffer.readDoubleLE(offset + 40);
    const tz = buffer.readDoubleLE(offset + 48);
    offset += 56;
    const cameraId = buffer.readUInt32LE(offset);
    offset += 4;

    const nameStart = offset;

    while (offset < buffer.byteLength && buffer[offset] !== 0) {
      offset += 1;
    }

    const name = buffer.toString("utf8", nameStart, offset);
    offset += 1;

    if (offset + 8 > buffer.byteLength) {
      break;
    }

    const points2DCount = Number(buffer.readBigUInt64LE(offset));
    offset += 8 + points2DCount * 24;

    cameras.push({
      id,
      name,
      cameraId,
      position: cameraCenterFromWorldToCamera(qw, qx, qy, qz, tx, ty, tz),
      rotation: [-qx, -qy, -qz, qw],
    });
  }

  return cameras;
}

function createAsciiPly(rows: string[]) {
  return [
    "ply",
    "format ascii 1.0",
    `element vertex ${rows.length}`,
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "end_header",
    ...rows,
    "",
  ].join("\n");
}

function cameraCenterFromWorldToCamera(
  qw: number,
  qx: number,
  qy: number,
  qz: number,
  tx: number,
  ty: number,
  tz: number
): [number, number, number] {
  const r00 = 1 - 2 * qy * qy - 2 * qz * qz;
  const r01 = 2 * qx * qy - 2 * qz * qw;
  const r02 = 2 * qx * qz + 2 * qy * qw;
  const r10 = 2 * qx * qy + 2 * qz * qw;
  const r11 = 1 - 2 * qx * qx - 2 * qz * qz;
  const r12 = 2 * qy * qz - 2 * qx * qw;
  const r20 = 2 * qx * qz - 2 * qy * qw;
  const r21 = 2 * qy * qz + 2 * qx * qw;
  const r22 = 1 - 2 * qx * qx - 2 * qy * qy;

  return [
    -(r00 * tx + r10 * ty + r20 * tz),
    -(r01 * tx + r11 * ty + r21 * tz),
    -(r02 * tx + r12 * ty + r22 * tz),
  ];
}
