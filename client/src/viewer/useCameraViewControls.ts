import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewerCameraPose } from "../types";
import { animateCameraView, createCameraPoseView, type CameraViewContext } from "./cameraView";

export function useCameraViewControls(
  cameras: ViewerCameraPose[],
  getContext: () => CameraViewContext | null,
  sceneRevision: number
) {
  const [selectedCamera, setSelectedCamera] = useState(1);
  const [active, setActive] = useState(false);
  const activeRef = useRef(active);
  const cancelAnimationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (cameras.length === 0) {
      setSelectedCamera(1);
      setActive(false);
      return;
    }

    setSelectedCamera((current) => Math.min(cameras.length, Math.max(1, current)));
  }, [cameras.length]);

  const stopAnimation = useCallback(() => {
    cancelAnimationRef.current?.();
    cancelAnimationRef.current = null;
  }, []);

  const animateToCamera = useCallback(
    (cameraNumber: number) => {
      const context = getContext();
      const cameraPose = cameras[cameraNumber - 1];

      if (!context || !cameraPose) {
        return;
      }

      stopAnimation();
      cancelAnimationRef.current = animateCameraView({
        camera: context.camera,
        controls: context.controls,
        to: createCameraPoseView(cameraPose, context),
      });
    },
    [cameras, getContext, stopAnimation]
  );

  const resetCameraView = useCallback(
    (returnToDefault: boolean) => {
      const context = getContext();

      setActive(false);
      stopAnimation();

      if (returnToDefault && context) {
        cancelAnimationRef.current = animateCameraView({
          camera: context.camera,
          controls: context.controls,
          to: context.defaultView,
        });
      }
    },
    [getContext, stopAnimation]
  );

  const toggleCameraView = useCallback(() => {
    if (activeRef.current) {
      resetCameraView(true);
      return;
    }

    if (cameras.length === 0) {
      return;
    }

    setActive(true);
    animateToCamera(selectedCamera);
  }, [animateToCamera, cameras.length, resetCameraView, selectedCamera]);

  const updateSelectedCamera = useCallback(
    (cameraNumber: number) => {
      if (cameras.length === 0) {
        return;
      }

      const nextCamera = Math.min(cameras.length, Math.max(1, cameraNumber));

      if (!Number.isFinite(nextCamera)) {
        return;
      }

      setSelectedCamera(nextCamera);

      if (activeRef.current) {
        animateToCamera(nextCamera);
      }
    },
    [animateToCamera, cameras.length]
  );

  const handleManualControlStart = useCallback(() => {
    if (!activeRef.current) {
      return;
    }

    resetCameraView(false);
  }, [resetCameraView]);

  useEffect(() => {
    if (!active) {
      return;
    }

    animateToCamera(selectedCamera);
  }, [active, animateToCamera, sceneRevision, selectedCamera]);

  useEffect(() => stopAnimation, [stopAnimation]);

  return {
    active,
    handleManualControlStart,
    selectedCamera,
    setSelectedCamera: updateSelectedCamera,
    toggleCameraView,
  };
}
