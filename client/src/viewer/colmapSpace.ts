import * as THREE from "three";
import type { ViewerCameraPose } from "../types";

const fallbackColmapToViewer = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1
);

function imageUpFromPose(cameraPose: ViewerCameraPose) {
  return new THREE.Vector3(0, -1, 0)
    .applyQuaternion(new THREE.Quaternion().fromArray(cameraPose.rotation))
    .normalize();
}

function imageRightFromPose(cameraPose: ViewerCameraPose) {
  return new THREE.Vector3(1, 0, 0)
    .applyQuaternion(new THREE.Quaternion().fromArray(cameraPose.rotation))
    .normalize();
}

function perpendicularTo(vector: THREE.Vector3) {
  const reference = Math.abs(vector.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);

  return reference.cross(vector).normalize();
}

export function createColmapToViewer(cameras: ViewerCameraPose[]) {
  if (cameras.length === 0) {
    return fallbackColmapToViewer.clone();
  }

  const up = new THREE.Vector3();
  const right = new THREE.Vector3();

  for (const cameraPose of cameras) {
    up.add(imageUpFromPose(cameraPose));
    right.add(imageRightFromPose(cameraPose));
  }

  if (up.lengthSq() < 0.0001) {
    return fallbackColmapToViewer.clone();
  }

  up.normalize();
  right.addScaledVector(up, -right.dot(up));

  if (right.lengthSq() < 0.0001) {
    right.copy(perpendicularTo(up));
  } else {
    right.normalize();
  }

  const depth = new THREE.Vector3().crossVectors(up, right).normalize();

  return new THREE.Matrix4().set(
    right.x, right.y, right.z, 0,
    depth.x, depth.y, depth.z, 0,
    up.x, up.y, up.z, 0,
    0, 0, 0, 1
  );
}

export function addCameraHelpers(
  scene: THREE.Object3D,
  cameras: ViewerCameraPose[],
  center: THREE.Vector3,
  colmapToViewer: THREE.Matrix4
) {
  const material = new THREE.LineBasicMaterial({ color: 0x2f6f8f });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.18, -0.12, 0.3),
    new THREE.Vector3(0.18, -0.12, 0.3),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.18, 0.12, 0.3),
    new THREE.Vector3(-0.18, 0.12, 0.3),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.18, -0.12, 0.3),
    new THREE.Vector3(-0.18, 0.12, 0.3),
    new THREE.Vector3(0.18, 0.12, 0.3),
    new THREE.Vector3(0.18, -0.12, 0.3),
  ]);
  const helpers: THREE.Line[] = [];

  for (const cameraPose of cameras) {
    const helper = new THREE.Line(geometry, material);
    const position = new THREE.Vector3().fromArray(cameraPose.position).sub(center);
    position.applyMatrix4(colmapToViewer);

    const rotation = new THREE.Quaternion().fromArray(cameraPose.rotation);
    const cameraMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(cameraPose.position),
      rotation,
      new THREE.Vector3(1, 1, 1)
    );
    cameraMatrix.premultiply(colmapToViewer);

    helper.position.copy(position);
    helper.quaternion.setFromRotationMatrix(cameraMatrix);
    helper.scale.setScalar(0.35);
    scene.add(helper);
    helpers.push(helper);
  }

  return () => {
    for (const helper of helpers) {
      scene.remove(helper);
    }
    geometry.dispose();
    material.dispose();
  };
}

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) {
    return 0;
  }

  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

export function computeRobustBounds(geometry: THREE.BufferGeometry, cameras: ViewerCameraPose[]) {
  const positions = geometry.getAttribute("position");

  if (!positions) {
    const center = new THREE.Vector3();
    return { center, radius: 1, pointRadius: 1 };
  }

  const step = Math.max(1, Math.floor(positions.count / 20000));
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];

  for (let index = 0; index < positions.count; index += step) {
    xs.push(positions.getX(index));
    ys.push(positions.getY(index));
    zs.push(positions.getZ(index));
  }

  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);

  const center = new THREE.Vector3(percentile(xs, 0.5), percentile(ys, 0.5), percentile(zs, 0.5));
  const distances: number[] = [];

  for (let index = 0; index < positions.count; index += step) {
    distances.push(
      Math.hypot(
        positions.getX(index) - center.x,
        positions.getY(index) - center.y,
        positions.getZ(index) - center.z
      )
    );
  }

  distances.sort((a, b) => a - b);

  const pointRadius = Math.max(percentile(distances, 0.98), 1);
  const cameraRadius = cameras.reduce((current, cameraPose) => {
    const cameraPosition = new THREE.Vector3().fromArray(cameraPose.position);

    return Math.max(current, cameraPosition.distanceTo(center));
  }, 0);
  const radius = Math.max(pointRadius, cameraRadius * 1.15, 1);

  return { center, radius, pointRadius };
}

export function createViewerGeometry(
  geometry: THREE.BufferGeometry,
  center: THREE.Vector3,
  colmapToViewer: THREE.Matrix4
) {
  const viewerGeometry = geometry.clone();
  viewerGeometry.translate(-center.x, -center.y, -center.z);
  viewerGeometry.applyMatrix4(colmapToViewer);

  return viewerGeometry;
}
