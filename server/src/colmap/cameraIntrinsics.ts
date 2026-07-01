import { readFile } from "node:fs/promises";
import type { ColmapCameraIntrinsics } from "../types.js";

type CameraModelInfo = {
  id: number;
  name: string;
  params: number;
  focal: "shared" | "xy";
};

const cameraModels: CameraModelInfo[] = [
  { id: 0, name: "SIMPLE_PINHOLE", params: 3, focal: "shared" },
  { id: 1, name: "PINHOLE", params: 4, focal: "xy" },
  { id: 2, name: "SIMPLE_RADIAL", params: 4, focal: "shared" },
  { id: 3, name: "RADIAL", params: 5, focal: "shared" },
  { id: 4, name: "OPENCV", params: 8, focal: "xy" },
  { id: 5, name: "OPENCV_FISHEYE", params: 8, focal: "xy" },
  { id: 6, name: "FULL_OPENCV", params: 12, focal: "xy" },
  { id: 7, name: "FOV", params: 5, focal: "xy" },
  { id: 8, name: "SIMPLE_RADIAL_FISHEYE", params: 4, focal: "shared" },
  { id: 9, name: "RADIAL_FISHEYE", params: 5, focal: "shared" },
  { id: 10, name: "THIN_PRISM_FISHEYE", params: 12, focal: "xy" },
];

const cameraModelsById = new Map(cameraModels.map((model) => [model.id, model]));
const cameraModelsByName = new Map(cameraModels.map((model) => [model.name, model]));

function createIntrinsics(model: CameraModelInfo, width: number, height: number, params: number[]): ColmapCameraIntrinsics {
  const focalLengthX = model.focal === "shared" ? params[0] : params[0];
  const focalLengthY = model.focal === "shared" ? params[0] : params[1];
  const principalPointX = model.focal === "shared" ? params[1] : params[2];
  const principalPointY = model.focal === "shared" ? params[2] : params[3];

  return {
    model: model.name,
    width,
    height,
    params,
    focalLengthX,
    focalLengthY,
    principalPointX,
    principalPointY,
  };
}

export async function readTextCameraIntrinsics(camerasPath: string) {
  const content = await readFile(camerasPath, "utf8");
  const intrinsics = new Map<number, ColmapCameraIntrinsics>();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const cameraId = Number(parts[0]);
    const model = cameraModelsByName.get(parts[1]);
    const width = Number(parts[2]);
    const height = Number(parts[3]);
    const params = parts.slice(4).map(Number);

    if (!model || !Number.isFinite(cameraId) || !Number.isFinite(width) || !Number.isFinite(height)) {
      continue;
    }

    intrinsics.set(cameraId, createIntrinsics(model, width, height, params));
  }

  return intrinsics;
}

export async function readBinaryCameraIntrinsics(camerasPath: string) {
  const buffer = await readFile(camerasPath);
  const count = Number(buffer.readBigUInt64LE(0));
  const intrinsics = new Map<number, ColmapCameraIntrinsics>();
  let offset = 8;

  for (let index = 0; index < count && offset + 24 <= buffer.byteLength; index += 1) {
    const cameraId = buffer.readUInt32LE(offset);
    const modelId = buffer.readInt32LE(offset + 4);
    const width = Number(buffer.readBigUInt64LE(offset + 8));
    const height = Number(buffer.readBigUInt64LE(offset + 16));
    offset += 24;

    const model = cameraModelsById.get(modelId);

    if (!model || offset + model.params * 8 > buffer.byteLength) {
      break;
    }

    const params: number[] = [];

    for (let paramIndex = 0; paramIndex < model.params; paramIndex += 1) {
      params.push(buffer.readDoubleLE(offset));
      offset += 8;
    }

    intrinsics.set(cameraId, createIntrinsics(model, width, height, params));
  }

  return intrinsics;
}
