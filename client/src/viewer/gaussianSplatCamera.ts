import * as SPLAT from "gsplat";
import * as THREE from "three";

type SplatCameraSyncOptions = {
  center: THREE.Vector3;
  colmapToViewer: THREE.Matrix4;
  modelToColmap: number[];
  splatCamera: SPLAT.Camera;
  viewerCamera: THREE.PerspectiveCamera;
};

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

function quaternionFromForwardImageUp(forward: THREE.Vector3, imageUp: THREE.Vector3) {
  const normalizedForward = forward.clone().normalize();
  const right = new THREE.Vector3().crossVectors(normalizedForward, imageUp).normalize();
  const down = new THREE.Vector3().crossVectors(normalizedForward, right).normalize();

  // gsplat cameras look along local +Z and their projection flips image Y, so
  // source image up maps to local -Y.
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, down, normalizedForward));
}

export function syncSplatCameraFromColmapViewer({
  center,
  colmapToViewer,
  modelToColmap,
  splatCamera,
  viewerCamera,
}: SplatCameraSyncOptions) {
  viewerCamera.updateMatrixWorld();

  // Coordinate ownership:
  // - COLMAP objects stay in COLMAP viewer-space: viewer = colmapToViewer * (raw - center).
  // - Gaussian splats stay in native exported PLY-space.
  // - Only the gsplat render camera crosses spaces: viewer -> raw COLMAP -> native splat.
  const viewerToColmap = colmapToViewer.clone().invert();
  const colmapToSplat = matrixFromRowMajor(modelToColmap).invert();
  const colmapPosition = viewerCamera.position.clone().applyMatrix4(viewerToColmap).add(center);
  const splatPosition = colmapPosition.applyMatrix4(colmapToSplat);
  const forward = new THREE.Vector3();
  viewerCamera.getWorldDirection(forward);

  const splatForward = forward.transformDirection(viewerToColmap).transformDirection(colmapToSplat).normalize();
  const splatUp = viewerCamera.up.clone().transformDirection(viewerToColmap).transformDirection(colmapToSplat).normalize();
  const rotation = quaternionFromForwardImageUp(splatForward, splatUp);
  const fov = THREE.MathUtils.degToRad(viewerCamera.fov);
  const fy = splatCamera.data.height / (2 * Math.tan(fov / 2));
  const fx =
    viewerCamera.aspect > 0 ? splatCamera.data.width / (2 * viewerCamera.aspect * Math.tan(fov / 2)) : fy;

  splatCamera.position = new SPLAT.Vector3(splatPosition.x, splatPosition.y, splatPosition.z);
  splatCamera.rotation = new SPLAT.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  splatCamera.data.fx = fx;
  splatCamera.data.fy = fy;
  splatCamera.update();
}
