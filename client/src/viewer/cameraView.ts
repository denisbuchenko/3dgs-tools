import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ViewerCameraPose } from "../types";

export type ViewerCameraView = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  aspect?: number;
  fov?: number;
};

export type CameraViewContext = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  center: THREE.Vector3;
  colmapToViewer: THREE.Matrix4;
  defaultView: ViewerCameraView;
  radius: number;
  scene: THREE.Scene;
};

export type CameraProjection = {
  aspect: number;
  fov: number;
  focalLengthX: number;
  focalLengthY: number;
  height: number;
  principalPointX: number;
  principalPointY: number;
  width: number;
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

export function transformPoseDirection(
  direction: THREE.Vector3,
  cameraPose: ViewerCameraPose,
  colmapToViewer: THREE.Matrix4
) {
  return direction
    .applyQuaternion(new THREE.Quaternion().fromArray(cameraPose.rotation))
    .transformDirection(colmapToViewer)
    .normalize();
}

export function createCameraPoseFrame(cameraPose: ViewerCameraPose, context: CameraViewContext) {
  return {
    position: new THREE.Vector3().fromArray(cameraPose.position).sub(context.center).applyMatrix4(context.colmapToViewer),
    forward: transformPoseDirection(new THREE.Vector3(0, 0, 1), cameraPose, context.colmapToViewer),
    right: transformPoseDirection(new THREE.Vector3(1, 0, 0), cameraPose, context.colmapToViewer),
    up: transformPoseDirection(new THREE.Vector3(0, -1, 0), cameraPose, context.colmapToViewer),
  };
}

export function createDefaultOrbitView(radius: number, aspect?: number): ViewerCameraView {
  return {
    aspect,
    position: new THREE.Vector3(radius * 1.6, -radius * 2.2, radius * 1.2),
    target: new THREE.Vector3(0, 0, 0),
    up: new THREE.Vector3(0, 0, 1),
    fov: 55,
  };
}

export function getCameraProjection(cameraPose: ViewerCameraPose): CameraProjection | null {
  const intrinsics = cameraPose.intrinsics;

  if (!intrinsics || intrinsics.width <= 0 || intrinsics.height <= 0) {
    return null;
  }

  const focalLengthX = intrinsics.focalLengthX > 0 ? intrinsics.focalLengthX : intrinsics.width;
  const focalLengthY = intrinsics.focalLengthY > 0 ? intrinsics.focalLengthY : focalLengthX;

  return {
    aspect: (intrinsics.width / focalLengthX) / (intrinsics.height / focalLengthY),
    fov: THREE.MathUtils.radToDeg(2 * Math.atan(intrinsics.height / (2 * focalLengthY))),
    focalLengthX,
    focalLengthY,
    height: intrinsics.height,
    principalPointX: intrinsics.principalPointX ?? intrinsics.width / 2,
    principalPointY: intrinsics.principalPointY ?? intrinsics.height / 2,
    width: intrinsics.width,
  };
}

export function createCameraPoseView(cameraPose: ViewerCameraPose, context: CameraViewContext): ViewerCameraView {
  const frame = createCameraPoseFrame(cameraPose, context);
  const targetDistance = Math.max(context.radius * 0.22, 0.35);
  const projection = getCameraProjection(cameraPose);

  return {
    position: frame.position,
    target: frame.position.clone().addScaledVector(frame.forward, targetDistance),
    up: frame.up,
    aspect: projection?.aspect,
    fov: projection?.fov,
  };
}

export function applyCameraView(camera: THREE.PerspectiveCamera, controls: OrbitControls, view: ViewerCameraView) {
  camera.position.copy(view.position);
  camera.up.copy(view.up).normalize();
  camera.fov = view.fov ?? camera.fov;
  camera.aspect = view.aspect ?? camera.aspect;
  controls.target.copy(view.target);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
}

export function animateCameraView({ camera, controls, durationMs = 500, to }: CameraViewAnimationOptions) {
  const from: ViewerCameraView = {
    aspect: camera.aspect,
    fov: camera.fov,
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
    camera.fov = THREE.MathUtils.lerp(from.fov ?? camera.fov, to.fov ?? camera.fov, eased);
    camera.aspect = THREE.MathUtils.lerp(from.aspect ?? camera.aspect, to.aspect ?? camera.aspect, eased);
    controls.target.lerpVectors(from.target, to.target, eased);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
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
