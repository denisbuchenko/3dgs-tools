import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ViewerCameraPose } from "../types";

export type ViewerCameraView = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
};

export type CameraViewContext = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  center: THREE.Vector3;
  colmapToViewer: THREE.Matrix4;
  defaultView: ViewerCameraView;
  radius: number;
};

type CameraViewAnimationOptions = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  durationMs?: number;
  to: ViewerCameraView;
};

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function transformPoseDirection(direction: THREE.Vector3, cameraPose: ViewerCameraPose, colmapToViewer: THREE.Matrix4) {
  return direction
    .applyQuaternion(new THREE.Quaternion().fromArray(cameraPose.rotation))
    .transformDirection(colmapToViewer)
    .normalize();
}

export function createDefaultOrbitView(radius: number): ViewerCameraView {
  return {
    position: new THREE.Vector3(radius * 1.6, -radius * 2.2, radius * 1.2),
    target: new THREE.Vector3(0, 0, 0),
    up: new THREE.Vector3(0, 0, 1),
  };
}

export function createCameraPoseView(cameraPose: ViewerCameraPose, context: CameraViewContext): ViewerCameraView {
  const position = new THREE.Vector3().fromArray(cameraPose.position).sub(context.center).applyMatrix4(context.colmapToViewer);
  const forward = transformPoseDirection(new THREE.Vector3(0, 0, 1), cameraPose, context.colmapToViewer);
  const up = transformPoseDirection(new THREE.Vector3(0, -1, 0), cameraPose, context.colmapToViewer);
  const targetDistance = Math.max(context.radius * 0.22, 0.35);

  return {
    position,
    target: position.clone().addScaledVector(forward, targetDistance),
    up,
  };
}

export function applyCameraView(camera: THREE.PerspectiveCamera, controls: OrbitControls, view: ViewerCameraView) {
  camera.position.copy(view.position);
  camera.up.copy(view.up).normalize();
  controls.target.copy(view.target);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
}

export function animateCameraView({ camera, controls, durationMs = 500, to }: CameraViewAnimationOptions) {
  const from: ViewerCameraView = {
    position: camera.position.clone(),
    target: controls.target.clone(),
    up: camera.up.clone().normalize(),
  };
  const startTime = performance.now();
  let frame = 0;
  let cancelled = false;

  const step = (time: number) => {
    if (cancelled) {
      return;
    }

    const progress = Math.min(1, (time - startTime) / durationMs);
    const eased = easeInOutCubic(progress);

    camera.position.lerpVectors(from.position, to.position, eased);
    camera.up.lerpVectors(from.up, to.up, eased).normalize();
    controls.target.lerpVectors(from.target, to.target, eased);
    camera.lookAt(controls.target);
    controls.update();

    if (progress < 1) {
      frame = window.requestAnimationFrame(step);
    }
  };

  frame = window.requestAnimationFrame(step);

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
  };
}
