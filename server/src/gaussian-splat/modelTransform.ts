import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFolder } from "../content/index.js";
import type { Project } from "../types.js";
import { findFirstFile, findFirstPly } from "./filesystem.js";

type Matrix4 = number[];
type Matrix3x4 = [number[], number[], number[]];
type Vec3 = [number, number, number];

const identityMatrix: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const maxCenterSamples = 70000;

type DatasetTransforms = {
  applied_transform?: unknown;
};

type DataparserTransforms = {
  scale?: unknown;
};

function asMatrix3x4(value: unknown): Matrix3x4 | null {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }

  const rows = value.slice(0, 3).map((row) => (Array.isArray(row) ? row.slice(0, 4).map(Number) : []));

  if (rows.some((row) => row.length < 4 || row.some((entry) => !Number.isFinite(entry)))) {
    return null;
  }

  return rows as Matrix3x4;
}

function invertRigidTransform(rows: Matrix3x4): Matrix4 {
  const r = rows.map((row) => row.slice(0, 3));
  const t = rows.map((row) => row[3]);

  return [
    r[0][0],
    r[1][0],
    r[2][0],
    -(r[0][0] * t[0] + r[1][0] * t[1] + r[2][0] * t[2]),
    r[0][1],
    r[1][1],
    r[2][1],
    -(r[0][1] * t[0] + r[1][1] * t[1] + r[2][1] * t[2]),
    r[0][2],
    r[1][2],
    r[2][2],
    -(r[0][2] * t[0] + r[1][2] * t[1] + r[2][2] * t[2]),
    0,
    0,
    0,
    1,
  ];
}

function multiplyMatrix(a: Matrix4, b: Matrix4): Matrix4 {
  const result = new Array<number>(16).fill(0);

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[row * 4 + col] += a[row * 4 + index] * b[index * 4 + col];
      }
    }
  }

  return result;
}

function scaleMatrix(value: number): Matrix4 {
  return [value, 0, 0, 0, 0, value, 0, 0, 0, 0, value, 0, 0, 0, 0, 1];
}

function translationMatrix([x, y, z]: Vec3): Matrix4 {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}

function applyMatrix(matrix: Matrix4, [x, y, z]: Vec3): Vec3 {
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
  ];
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function medianCenter(points: Vec3[]): Vec3 | null {
  if (points.length === 0) {
    return null;
  }

  return [median(points.map((point) => point[0])), median(points.map((point) => point[1])), median(points.map((point) => point[2]))];
}

async function readColmapCenter(pointsPath: string): Promise<Vec3 | null> {
  const text = await readFile(pointsPath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  const stride = Math.max(1, Math.floor(lines.length / maxCenterSamples));
  const points: Vec3[] = [];

  for (let index = 0; index < lines.length; index += stride) {
    const parts = lines[index].trim().split(/\s+/).map(Number);

    if (parts.length >= 4 && parts.slice(1, 4).every(Number.isFinite)) {
      points.push([parts[1], parts[2], parts[3]]);
    }
  }

  return medianCenter(points);
}

function readPlyHeader(buffer: Buffer) {
  const marker = Buffer.from("end_header\n", "ascii");
  const headerEnd = buffer.indexOf(marker);

  if (headerEnd < 0) {
    return null;
  }

  const headerText = buffer.subarray(0, headerEnd + marker.length).toString("ascii");
  const lines = headerText.split(/\r?\n/);
  const vertexCountLine = lines.find((line) => line.startsWith("element vertex "));
  const vertexCount = vertexCountLine ? Number(vertexCountLine.split(/\s+/)[2]) : NaN;
  const properties: string[] = [];
  let inVertex = false;

  for (const line of lines) {
    if (line.startsWith("element vertex ")) {
      inVertex = true;
      continue;
    }

    if (line.startsWith("element ") && !line.startsWith("element vertex ")) {
      inVertex = false;
    }

    if (inVertex && line.startsWith("property float ")) {
      properties.push(line.split(/\s+/)[2]);
    }
  }

  if (!Number.isFinite(vertexCount) || vertexCount <= 0) {
    return null;
  }

  return {
    dataStart: headerEnd + marker.length,
    properties,
    vertexCount,
  };
}

async function readSplatCenter(plyPath: string, transform: Matrix4): Promise<Vec3 | null> {
  const buffer = await readFile(plyPath);
  const header = readPlyHeader(buffer);

  if (!header || header.properties.length === 0) {
    return null;
  }

  const xIndex = header.properties.indexOf("x");
  const yIndex = header.properties.indexOf("y");
  const zIndex = header.properties.indexOf("z");
  const stride = header.properties.length * Float32Array.BYTES_PER_ELEMENT;

  if (xIndex < 0 || yIndex < 0 || zIndex < 0 || stride <= 0) {
    return null;
  }

  const sampleStride = Math.max(1, Math.floor(header.vertexCount / maxCenterSamples));
  const points: Vec3[] = [];

  for (let index = 0; index < header.vertexCount; index += sampleStride) {
    const offset = header.dataStart + index * stride;

    if (offset + stride > buffer.length) {
      break;
    }

    points.push(
      applyMatrix(transform, [
        buffer.readFloatLE(offset + xIndex * Float32Array.BYTES_PER_ELEMENT),
        buffer.readFloatLE(offset + yIndex * Float32Array.BYTES_PER_ELEMENT),
        buffer.readFloatLE(offset + zIndex * Float32Array.BYTES_PER_ELEMENT),
      ])
    );
  }

  return medianCenter(points);
}

async function alignSplatCenter(projectFolder: string, transform: Matrix4): Promise<Matrix4> {
  const colmapCenter = await readColmapCenter(path.join(projectFolder, "colmap", "txt", "points3D.txt")).catch(() => null);
  const resultSplatPath = path.join(projectFolder, "gsplat", "splats.ply");
  const splatCenter =
    (await readSplatCenter(resultSplatPath, transform).catch(() => null)) ??
    (await findFirstPly(path.join(projectFolder, "gsplat")).then((splatPath) =>
      splatPath ? readSplatCenter(splatPath, transform).catch(() => null) : null
    ));

  if (!colmapCenter || !splatCenter) {
    return transform;
  }

  return multiplyMatrix(
    translationMatrix([
      colmapCenter[0] - splatCenter[0],
      colmapCenter[1] - splatCenter[1],
      colmapCenter[2] - splatCenter[2],
    ]),
    transform
  );
}

export async function readGsplatModelToColmapTransform(project: Project): Promise<Matrix4> {
  const projectFolder = getProjectFolder(project);
  const datasetPath = path.join(projectFolder, "gsplat", "dataset", "transforms.json");
  const dataparserPath = await findFirstFile(path.join(projectFolder, "gsplat", "outputs"), "dataparser_transforms.json");

  if (!dataparserPath) {
    return identityMatrix;
  }

  try {
    const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as DatasetTransforms;
    const dataparser = JSON.parse(await readFile(dataparserPath, "utf8")) as DataparserTransforms;
    const appliedTransform = asMatrix3x4(dataset.applied_transform) ?? [
      [1, 0, 0, 0],
      [0, 0, 1, 0],
      [0, -1, 0, 0],
    ];
    const scale = Number(dataparser.scale);

    if (!Number.isFinite(scale) || scale <= 0) {
      return identityMatrix;
    }

    // Nerfstudio's exported splat PLY is already in the export coordinate frame.
    // Applying inverse dataparser transform here over-expands splat positions and
    // leaves large visual gaps between gaussians, so we only undo the dataset axis
    // transform and use dataparser scale to match COLMAP's metric size.
    const splatToColmap = multiplyMatrix(invertRigidTransform(appliedTransform), scaleMatrix(scale));

    return alignSplatCenter(projectFolder, splatToColmap);
  } catch {
    return identityMatrix;
  }
}

export function getIdentityModelToColmapTransform() {
  return [...identityMatrix];
}
