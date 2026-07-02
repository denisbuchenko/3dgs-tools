import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import type { ViewerCameraPose } from "../types";
import { addCameraHelpers, computeRobustBounds } from "./colmapSpace";

export type GaussianOverlayState = {
  cameraHelpersCleanup: (() => void) | null;
  colmapToSplat: THREE.Matrix4;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  pointCloud: THREE.Points;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  viewerGeometry: THREE.BufferGeometry;
};

export async function mountGaussianColmapOverlay({
  cameras,
  colmapPlyUrl,
  colmapToSplat,
  surface,
}: {
  cameras: ViewerCameraPose[];
  colmapPlyUrl: string;
  colmapToSplat: THREE.Matrix4;
  surface: HTMLElement;
}) {
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.className = "viewer-canvas gaussian-overlay-canvas";
  overlayCanvas.style.pointerEvents = "none";
  surface.append(overlayCanvas);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas: overlayCanvas,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const geometry = await new PLYLoader().loadAsync(colmapPlyUrl);
  const viewerGeometry = geometry.clone();
  viewerGeometry.applyMatrix4(colmapToSplat);

  const { pointRadius } = computeRobustBounds(viewerGeometry, []);
  const hasColor = Boolean(geometry.getAttribute("color"));
  const material = new THREE.PointsMaterial({
    color: hasColor ? 0xffffff : 0x1d1f23,
    size: Math.max(pointRadius / 700, 0.004),
    sizeAttenuation: true,
    vertexColors: hasColor,
  });
  const pointCloud = new THREE.Points(viewerGeometry, material);
  pointCloud.visible = false;
  scene.add(pointCloud);

  return {
    cameraHelpersCleanup: null,
    colmapToSplat,
    geometry,
    material,
    pointCloud,
    renderer,
    scene,
    viewerGeometry,
  } satisfies GaussianOverlayState;
}

export function updateGaussianOverlayCameras(
  overlay: GaussianOverlayState | null,
  cameras: ViewerCameraPose[],
  visible: boolean
) {
  overlay?.cameraHelpersCleanup?.();

  if (!overlay || !visible) {
    if (overlay) {
      overlay.cameraHelpersCleanup = null;
    }
    return;
  }

  overlay.cameraHelpersCleanup = addCameraHelpers(
    overlay.scene,
    cameras,
    new THREE.Vector3(),
    overlay.colmapToSplat
  );
}

export function disposeGaussianOverlay(overlay: GaussianOverlayState | null) {
  if (!overlay) {
    return;
  }

  overlay.cameraHelpersCleanup?.();
  overlay.geometry.dispose();
  overlay.viewerGeometry.dispose();
  overlay.material.dispose();
  overlay.renderer.dispose();
  overlay.renderer.domElement.remove();
}
