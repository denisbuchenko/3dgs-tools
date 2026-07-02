import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFolder } from "../content/index.js";
import type { Project } from "../types.js";
import { findFirstFile } from "./filesystem.js";

type Matrix4 = number[];
type Matrix3x4 = [number[], number[], number[]];
type Vec3 = [number, number, number];

const identityMatrix: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// These percentiles are coupled with client/src/viewer/gaussianSplatLoader.ts.
// The alignment radius scales splat centers to the dense object area, while the
// tail radius estimates how much gaussian footprints must be expanded so the
// same model does not become visually thin and gappy after display alignment.
const alignmentRadiusPercentile = 0.8;
const tailRadiusPercentile = 0.98;
const maxStatsSamples = 70000;

type DataparserTransforms = {
  scale?: unknown;
  transform?: unknown;
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

function invertRotation(rows: Matrix3x4): Matrix4 {
  const r = rows.map((row) => row.slice(0, 3));

  return [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, 0, 0, 0, 1];
}

function applyMatrix(matrix: Matrix4, [x, y, z]: Vec3): Vec3 {
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
  ];
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }

  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))];
}

function robustStats(points: Vec3[], radiusPercentile: number) {
  if (points.length === 0) {
    return null;
  }

  const center: Vec3 = [
    percentile(
      points.map((point) => point[0]),
      0.5
    ),
    percentile(
      points.map((point) => point[1]),
      0.5
    ),
    percentile(
      points.map((point) => point[2]),
      0.5
    ),
  ];
  const distances = points.map((point) =>
    Math.hypot(point[0] - center[0], point[1] - center[1], point[2] - center[2])
  );
  const radius = percentile(distances, radiusPercentile);

  return radius > 0 ? { center, radius } : null;
}

async function readColmapPoints(pointsPath: string): Promise<Vec3[]> {
  const text = await readFile(pointsPath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  const stride = Math.max(1, Math.floor(lines.length / maxStatsSamples));
  const points: Vec3[] = [];

  for (let index = 0; index < lines.length; index += stride) {
    const parts = lines[index].trim().split(/\s+/).map(Number);

    if (parts.length >= 4 && parts.slice(1, 4).every(Number.isFinite)) {
      points.push([parts[1], parts[2], parts[3]]);
    }
  }

  return points;
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

async function readSplatPoints(plyPath: string): Promise<Vec3[]> {
  const buffer = await readFile(plyPath);
  const header = readPlyHeader(buffer);

  if (!header) {
    return [];
  }

  const xIndex = header.properties.indexOf("x");
  const yIndex = header.properties.indexOf("y");
  const zIndex = header.properties.indexOf("z");
  const stride = header.properties.length * Float32Array.BYTES_PER_ELEMENT;

  if (xIndex < 0 || yIndex < 0 || zIndex < 0 || stride <= 0) {
    return [];
  }

  const sampleStride = Math.max(1, Math.floor(header.vertexCount / maxStatsSamples));
  const points: Vec3[] = [];

  for (let index = 0; index < header.vertexCount; index += sampleStride) {
    const offset = header.dataStart + index * stride;

    if (offset + stride > buffer.length) {
      break;
    }

    points.push([
      buffer.readFloatLE(offset + xIndex * Float32Array.BYTES_PER_ELEMENT),
      buffer.readFloatLE(offset + yIndex * Float32Array.BYTES_PER_ELEMENT),
      buffer.readFloatLE(offset + zIndex * Float32Array.BYTES_PER_ELEMENT),
    ]);
  }

  return points;
}

async function createRobustDisplayTransform(projectFolder: string, dataparserTransform: Matrix3x4) {
  const [colmapPoints, splatPoints] = await Promise.all([
    readColmapPoints(path.join(projectFolder, "colmap", "txt", "points3D.txt")),
    readSplatPoints(path.join(projectFolder, "gsplat", "splats.ply")),
  ]);
  const rotation = invertRotation(dataparserTransform);
  const orientedSplatPoints = splatPoints.map((point) => applyMatrix(rotation, point));
  const colmapStats = robustStats(colmapPoints, alignmentRadiusPercentile);
  const splatStats = robustStats(orientedSplatPoints, alignmentRadiusPercentile);
  const colmapTailStats = robustStats(colmapPoints, tailRadiusPercentile);
  const splatTailStats = robustStats(orientedSplatPoints, tailRadiusPercentile);

  if (!colmapStats || !splatStats) {
    return null;
  }

  const scale = colmapStats.radius / splatStats.radius;
  const tailScale = colmapTailStats && splatTailStats ? colmapTailStats.radius / splatTailStats.radius : scale;

  // Do not drop this compensation when changing alignment. Scaling centers by
  // the dense object radius while keeping gaussian radii at the tail/outlier
  // scale is the failure mode where splats look sparse with visible gaps.
  const coverageScale = Math.min(3, Math.max(1, scale / tailScale));
  const scaledSplatCenter: Vec3 = [
    splatStats.center[0] * scale,
    splatStats.center[1] * scale,
    splatStats.center[2] * scale,
  ];

  return {
    modelToColmap: multiplyMatrix(
      multiplyMatrix(
        translationMatrix([
          colmapStats.center[0] - scaledSplatCenter[0],
          colmapStats.center[1] - scaledSplatCenter[1],
          colmapStats.center[2] - scaledSplatCenter[2],
        ]),
        scaleMatrix(scale)
      ),
      rotation
    ),
    splatCoverageScale: coverageScale,
  };
}

export async function readGsplatDisplayTransform(project: Project): Promise<{
  modelToColmap: Matrix4;
  splatCoverageScale: number;
}> {
  const projectFolder = getProjectFolder(project);
  const dataparserPath = await findFirstFile(path.join(projectFolder, "gsplat", "outputs"), "dataparser_transforms.json");

  if (!dataparserPath) {
    return { modelToColmap: identityMatrix, splatCoverageScale: 1 };
  }

  try {
    const dataparser = JSON.parse(await readFile(dataparserPath, "utf8")) as DataparserTransforms;
    const dataparserTransform = asMatrix3x4(dataparser.transform);
    const scale = Number(dataparser.scale);

    if (!dataparserTransform || !Number.isFinite(scale) || scale <= 0) {
      return { modelToColmap: identityMatrix, splatCoverageScale: 1 };
    }

    // ns-export gaussian-splat writes model.means directly. For display we keep
    // splat buffers untouched and build a camera-space bridge: Nerfstudio gives
    // the orientation, while robust sampled bounds keep exported splats tight to
    // the COLMAP sparse cloud despite optimization drift/outlier gaussians. The
    // returned splatCoverageScale is part of the same display contract.
    return (
      (await createRobustDisplayTransform(projectFolder, dataparserTransform).catch(() => null)) ??
      {
        modelToColmap: multiplyMatrix(invertRigidTransform(dataparserTransform), scaleMatrix(1 / scale)),
        splatCoverageScale: 1,
      }
    );
  } catch {
    return { modelToColmap: identityMatrix, splatCoverageScale: 1 };
  }
}

export async function readGsplatModelToColmapTransform(project: Project): Promise<Matrix4> {
  return (await readGsplatDisplayTransform(project)).modelToColmap;
}

export function getIdentityModelToColmapTransform() {
  return [...identityMatrix];
}

export function getIdentitySplatCoverageScale() {
  return 1;
}
