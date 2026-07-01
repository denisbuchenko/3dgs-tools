import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getProjectFolder } from "../content/index.js";
import type { Project } from "../types.js";

export async function findFirstFile(root: string, fileName: string): Promise<string | null> {
  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);

      if (entry.isFile() && entry.name === fileName) {
        return entryPath;
      }

      if (entry.isDirectory()) {
        const nested = await findFirstFile(entryPath, fileName);

        if (nested) {
          return nested;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function findFirstPly(root: string): Promise<string | null> {
  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".ply")) {
        return entryPath;
      }

      if (entry.isDirectory()) {
        const nested = await findFirstPly(entryPath);

        if (nested) {
          return nested;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function assertHasColmap(project: Project) {
  const sparsePath = path.join(getProjectFolder(project), "colmap", "sparse", "0");

  await stat(path.join(sparsePath, "cameras.bin"));
  await stat(path.join(sparsePath, "images.bin"));
  await stat(path.join(sparsePath, "points3D.bin"));
}

export async function copyColmapModelForNerfstudio(project: Project, datasetPath: string) {
  const sourceSparsePath = path.join(getProjectFolder(project), "colmap", "sparse", "0");
  const targetSparsePath = path.join(datasetPath, "colmap", "sparse", "0");
  const entries = await readdir(sourceSparsePath, { withFileTypes: true });

  await mkdir(targetSparsePath, { recursive: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    await copyFile(path.join(sourceSparsePath, entry.name), path.join(targetSparsePath, entry.name));
  }
}
