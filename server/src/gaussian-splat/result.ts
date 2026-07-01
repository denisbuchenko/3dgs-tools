import { stat } from "node:fs/promises";
import path from "node:path";
import { getProjectFolder } from "../content/index.js";
import type { GsplatResult, Project } from "../types.js";

export async function getGsplatResult(project: Project): Promise<GsplatResult> {
  const plyPath = path.join(getProjectFolder(project), "gsplat", "splats.ply");

  try {
    const plyStat = await stat(plyPath);
    const plyVersion = `${Math.round(plyStat.mtimeMs)}-${plyStat.size}`;

    return {
      hasResult: true,
      plyUrl: `/api/projects/${encodeURIComponent(project.id)}/gsplat/splats.ply?v=${plyVersion}`,
    };
  } catch {
    return {
      hasResult: false,
      plyUrl: null,
    };
  }
}

export async function resolveGsplatPly(project: Project) {
  const plyPath = path.join(getProjectFolder(project), "gsplat", "splats.ply");
  const plyStat = await stat(plyPath);

  return {
    path: plyPath,
    size: plyStat.size,
  };
}
