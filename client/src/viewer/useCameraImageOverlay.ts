import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ViewerCameraPose } from "../types";
import { createCameraPoseView, getCameraProjection, type CameraViewContext } from "./cameraView";

type CameraImageOverlay = {
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  texture: THREE.Texture;
};

type CameraImageOverlayOptions = {
  active: boolean;
  cameras: ViewerCameraPose[];
  getContext: () => CameraViewContext | null;
  imageUrlByName?: Record<string, string>;
  sceneRevision: number;
  selectedCamera: number;
};

const targetOpacity = 0.82;

function basename(value: string) {
  return value.split(/[\\/]/).pop() ?? value;
}

function imageUrlForCamera(cameraPose: ViewerCameraPose | undefined, imageUrlByName?: Record<string, string>) {
  if (!cameraPose || !imageUrlByName) {
    return null;
  }

  return imageUrlByName[cameraPose.name] ?? imageUrlByName[basename(cameraPose.name)] ?? null;
}

function disposeOverlay(overlay: CameraImageOverlay) {
  overlay.mesh.removeFromParent();
  overlay.mesh.geometry.dispose();
  overlay.material.dispose();
  overlay.texture.dispose();
}

function animateOpacity(overlay: CameraImageOverlay, toOpacity: number, onDone?: () => void) {
  const fromOpacity = overlay.material.opacity;
  const startTime = performance.now();
  let frame = 0;
  let cancelled = false;

  const step = (time: number) => {
    if (cancelled) {
      return;
    }

    const progress = Math.min(1, (time - startTime) / 280);
    const eased = 1 - Math.pow(1 - progress, 3);

    overlay.material.opacity = fromOpacity + (toOpacity - fromOpacity) * eased;
    overlay.material.needsUpdate = true;

    if (progress < 1) {
      frame = window.requestAnimationFrame(step);
      return;
    }

    onDone?.();
  };

  frame = window.requestAnimationFrame(step);

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
  };
}

function createImageOverlay(cameraPose: ViewerCameraPose, context: CameraViewContext, texture: THREE.Texture) {
  const cameraView = createCameraPoseView(cameraPose, context);
  const image = texture.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined;
  const aspect = image && "width" in image && image.height > 0 ? image.width / image.height : 1.5;
  const projection = getCameraProjection(cameraPose);
  const forward = cameraView.target.clone().sub(cameraView.position).normalize();
  const up = cameraView.up.clone().normalize();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  up.crossVectors(right, forward).normalize();

  const depth = Math.max(context.camera.near * 4, context.radius * 0.006, 0.18);
  const width = projection ? (projection.width / projection.focalLengthX) * depth : aspect * depth;
  const height = projection ? (projection.height / projection.focalLengthY) * depth : depth;
  const xOffset = projection ? ((projection.width / 2 - projection.principalPointX) / projection.focalLengthX) * depth : 0;
  const yOffset = projection ? ((projection.principalPointY - projection.height / 2) / projection.focalLengthY) * depth : 0;
  const center = cameraView.position
    .clone()
    .addScaledVector(forward, depth)
    .addScaledVector(right, xOffset)
    .addScaledVector(up, yOffset);
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    map: texture,
    opacity: 0,
    side: THREE.DoubleSide,
    transparent: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const matrix = new THREE.Matrix4().makeBasis(right, up, forward.clone().negate());

  mesh.position.copy(center);
  mesh.quaternion.setFromRotationMatrix(matrix);
  mesh.renderOrder = 5;
  context.scene.add(mesh);

  return { material, mesh, texture };
}

export function useCameraImageOverlay({
  active,
  cameras,
  getContext,
  imageUrlByName,
  sceneRevision,
  selectedCamera,
}: CameraImageOverlayOptions) {
  const [showImage, setShowImage] = useState(false);
  const overlayRef = useRef<CameraImageOverlay | null>(null);
  const cancelFadeInRef = useRef<(() => void) | null>(null);
  const retirementsRef = useRef(new Map<CameraImageOverlay, () => void>());
  const requestIdRef = useRef(0);
  const selectedCameraPose = cameras[selectedCamera - 1];
  const selectedImageUrl = imageUrlForCamera(selectedCameraPose, imageUrlByName);
  const selectedImageAvailable = Boolean(selectedImageUrl);

  const fadeOutCurrent = useCallback(() => {
    const overlay = overlayRef.current;

    cancelFadeInRef.current?.();
    cancelFadeInRef.current = null;

    if (!overlay) {
      return;
    }

    overlayRef.current = null;
    const cancelFadeOut = animateOpacity(overlay, 0, () => {
      retirementsRef.current.delete(overlay);
      disposeOverlay(overlay);
    });
    retirementsRef.current.set(overlay, cancelFadeOut);
  }, []);

  useEffect(() => {
    if (!active || !showImage || !selectedCameraPose || !selectedImageUrl) {
      fadeOutCurrent();
      return;
    }

    const context = getContext();

    if (!context) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    fadeOutCurrent();

    const loader = new THREE.TextureLoader();
    let cancelled = false;

    loader.load(
      selectedImageUrl,
      (texture) => {
        if (cancelled || requestId !== requestIdRef.current) {
          texture.dispose();
          return;
        }

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;

        const overlay = createImageOverlay(selectedCameraPose, context, texture);
        overlayRef.current = overlay;
        cancelFadeInRef.current?.();
        cancelFadeInRef.current = animateOpacity(overlay, targetOpacity, () => {
          cancelFadeInRef.current = null;
        });
      },
      undefined,
      () => {
        if (requestId === requestIdRef.current) {
          fadeOutCurrent();
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [active, fadeOutCurrent, getContext, sceneRevision, selectedCameraPose, selectedImageUrl, showImage]);

  useEffect(() => {
    if (!selectedImageAvailable) {
      setShowImage(false);
    }
  }, [selectedImageAvailable]);

  useEffect(() => {
    if (!active) {
      setShowImage(false);
    }
  }, [active]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      cancelFadeInRef.current?.();

      if (overlayRef.current) {
        disposeOverlay(overlayRef.current);
        overlayRef.current = null;
      }

      for (const [overlay, cancelFadeOut] of retirementsRef.current) {
        cancelFadeOut();
        disposeOverlay(overlay);
      }
      retirementsRef.current.clear();
    },
    []
  );

  return {
    selectedImageAvailable,
    setShowImage,
    showImage,
  };
}
