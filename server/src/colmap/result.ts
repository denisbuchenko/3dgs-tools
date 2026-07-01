import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getProjectFolder } from "../content/index.js";
import type { ColmapCameraPose, ColmapResult, Project } from "../types.js";
import { readTextCameraIntrinsics } from "./cameraIntrinsics.js";

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

async function readCameraPoses(project: Project): Promise<ColmapCameraPose[]> {
  const textPath = path.join(getProjectFolder(project), "colmap", "txt");
  const imagesPath = path.join(textPath, "images.txt");
  const intrinsics = await readTextCameraIntrinsics(path.join(textPath, "cameras.txt")).catch(() => new Map());

  try {
    const content = await readFile(imagesPath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    const cameras: ColmapCameraPose[] = [];

    for (let index = 0; index < lines.length; index += 2) {
      const parts = lines[index]?.split(/\s+/) ?? [];

      if (parts.length < 10) {
        continue;
      }

      const id = Number(parts[0]);
      const qw = Number(parts[1]);
      const qx = Number(parts[2]);
      const qy = Number(parts[3]);
      const qz = Number(parts[4]);
      const tx = Number(parts[5]);
      const ty = Number(parts[6]);
      const tz = Number(parts[7]);
      const cameraId = Number(parts[8]);
      const name = parts.slice(9).join(" ");

      if ([id, qw, qx, qy, qz, tx, ty, tz, cameraId].some((value) => !Number.isFinite(value))) {
        continue;
      }

      cameras.push({
        id,
        name,
        cameraId,
        intrinsics: intrinsics.get(cameraId),
        position: cameraCenterFromWorldToCamera(qw, qx, qy, qz, tx, ty, tz),
        rotation: [-qx, -qy, -qz, qw],
      });
    }

    return cameras;
  } catch {
    return [];
  }
}

export async function getColmapResult(project: Project): Promise<ColmapResult> {
  const plyPath = path.join(getProjectFolder(project), "colmap", "points.ply");

  try {
    const plyStat = await stat(plyPath);
    const plyVersion = `${Math.round(plyStat.mtimeMs)}-${plyStat.size}`;

    return {
      hasResult: true,
      plyUrl: `/api/projects/${encodeURIComponent(project.id)}/colmap/points.ply?v=${plyVersion}`,
      cameras: await readCameraPoses(project),
    };
  } catch {
    return {
      hasResult: false,
      plyUrl: null,
      cameras: [],
    };
  }
}

export async function resolveColmapPly(project: Project) {
  const plyPath = path.join(getProjectFolder(project), "colmap", "points.ply");
  const plyStat = await stat(plyPath);

  return {
    path: plyPath,
    size: plyStat.size,
  };
}
