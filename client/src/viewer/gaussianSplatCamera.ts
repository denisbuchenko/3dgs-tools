import * as SPLAT from "gsplat";
import * as THREE from "three";
import type { ViewerCameraPose } from "../types";

export type SplatSceneInfo = {
  center: SPLAT.Vector3;
  fitDistance: number;
  maxDimension: number;
};

export const splatFitDirection = new SPLAT.Vector3(0.72, 0.38, 1).normalize();

export function matrixFromRowMajor(values: number[]) {
  if (values.length !== 16 || values.some((value) => !Number.isFinite(value))) {
    return new THREE.Matrix4();
  }

  return new THREE.Matrix4().set(
    values[0],
    values[1],
    values[2],
    values[3],
    values[4],
    values[5],
    values[6],
    values[7],
    values[8],
    values[9],
    values[10],
    values[11],
    values[12],
    values[13],
    values[14],
    values[15]
  );
}

function createLookRotation(position: SPLAT.Vector3, target: SPLAT.Vector3) {
  const direction = target.subtract(position).normalize();
  const rx = Math.asin(-direction.y);
  const ry = Math.atan2(direction.x, direction.z);

  return SPLAT.Quaternion.FromEuler(new SPLAT.Vector3(rx, ry, 0));
}

export function getSplatSceneInfo(scene: SPLAT.Scene): SplatSceneInfo {
  let min: SPLAT.Vector3 | null = null;
  let max: SPLAT.Vector3 | null = null;

  for (const object of scene.objects) {
    if (object instanceof SPLAT.Splat) {
      const bounds = object.bounds;

      if (!min || !max) {
        min = bounds.min.clone();
        max = bounds.max.clone();
      } else {
        min = min.min(bounds.min);
        max = max.max(bounds.max);
      }
    }
  }

  if (!min || !max) {
    return {
      center: new SPLAT.Vector3(0, 0, 0),
      fitDistance: 4,
      maxDimension: 2,
    };
  }

  const size = max.subtract(min);
  const maxDimension = Math.max(size.x, size.y, size.z, 0.25);

  return {
    center: min.add(max).divide(2),
    fitDistance: Math.max(maxDimension * 1.8, 2),
    maxDimension,
  };
}

export function fitSplatCamera(camera: SPLAT.Camera, controls: SPLAT.OrbitControls, info: SplatSceneInfo) {
  const position = info.center.add(splatFitDirection.multiply(info.fitDistance));

  camera.position = position;
  camera.rotation = createLookRotation(position, info.center);
  controls.setCameraTarget(info.center);
  controls.minZoom = Math.max(info.maxDimension * 0.03, 0.05);
  controls.maxZoom = Math.max(info.maxDimension * 12, 10);
}

export function syncOverlayCamera(splatCamera: SPLAT.Camera, threeCamera: THREE.PerspectiveCamera) {
  splatCamera.update();
  threeCamera.matrixAutoUpdate = false;
  threeCamera.projectionMatrix.fromArray(splatCamera.data.projectionMatrix.buffer);
  threeCamera.projectionMatrixInverse.copy(threeCamera.projectionMatrix).invert();
  threeCamera.matrixWorldInverse.fromArray(splatCamera.data.viewMatrix.buffer);
  threeCamera.matrixWorld.copy(threeCamera.matrixWorldInverse).invert();
  threeCamera.matrix.copy(threeCamera.matrixWorld);
  threeCamera.matrixWorld.decompose(threeCamera.position, threeCamera.quaternion, threeCamera.scale);
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function animateSplatCameraView(
  camera: SPLAT.Camera,
  controls: SPLAT.OrbitControls,
  fromTarget: SPLAT.Vector3,
  toPosition: SPLAT.Vector3,
  toTarget: SPLAT.Vector3,
  onDone: (target: SPLAT.Vector3) => void
) {
  const fromPosition = camera.position.clone();
  const startTime = performance.now();
  let frame = 0;
  let cancelled = false;

  const step = (time: number) => {
    if (cancelled) {
      return;
    }

    const progress = Math.min(1, (time - startTime) / 500);
    const eased = easeInOutCubic(progress);
    const position = fromPosition.lerp(toPosition, eased);
    const target = fromTarget.lerp(toTarget, eased);

    camera.position = position;
    camera.rotation = createLookRotation(position, target);
    controls.setCameraTarget(target);
    controls.update();

    if (progress < 1) {
      frame = window.requestAnimationFrame(step);
      return;
    }

    onDone(toTarget);
  };

  frame = window.requestAnimationFrame(step);

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
  };
}

export function createSplatCameraView(
  cameraPose: ViewerCameraPose,
  colmapToSplat: THREE.Matrix4,
  sceneInfo: SplatSceneInfo
) {
  const rawRotation = new THREE.Quaternion().fromArray(cameraPose.rotation);
  const position = new THREE.Vector3().fromArray(cameraPose.position).applyMatrix4(colmapToSplat);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rawRotation).transformDirection(colmapToSplat).normalize();
  const target = position.clone().addScaledVector(forward, Math.max(sceneInfo.maxDimension * 0.12, 0.35));

  return {
    position: new SPLAT.Vector3(position.x, position.y, position.z),
    target: new SPLAT.Vector3(target.x, target.y, target.z),
  };
}
