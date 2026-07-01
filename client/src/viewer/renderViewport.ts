import * as THREE from "three";

function fitViewport(canvasWidth: number, canvasHeight: number, targetAspect: number) {
  const canvasAspect = canvasWidth / Math.max(canvasHeight, 1);

  if (!Number.isFinite(targetAspect) || targetAspect <= 0) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  }

  if (canvasAspect > targetAspect) {
    const width = Math.round(canvasHeight * targetAspect);

    return {
      x: Math.floor((canvasWidth - width) / 2),
      y: 0,
      width,
      height: canvasHeight,
    };
  }

  const height = Math.round(canvasWidth / targetAspect);

  return {
    x: 0,
    y: Math.floor((canvasHeight - height) / 2),
    width: canvasWidth,
    height,
  };
}

export function prepareViewerViewport(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  useCameraAspect: boolean
) {
  const canvas = renderer.domElement;
  const width = canvas.parentElement?.clientWidth ?? canvas.clientWidth;
  const height = canvas.parentElement?.clientHeight ?? canvas.clientHeight;

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
  renderer.clear(true, true, true);

  if (!useCameraAspect) {
    return;
  }

  const viewport = fitViewport(width, height, camera.aspect);
  renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
  renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
  renderer.setScissorTest(true);
}
