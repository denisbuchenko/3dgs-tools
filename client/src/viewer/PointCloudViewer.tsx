import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import type { ViewerCameraPose } from "../types";
import { CameraViewControls } from "./CameraViewControls";
import { applyCameraView, createDefaultOrbitView, type CameraViewContext } from "./cameraView";
import { addCameraHelpers, computeRobustBounds, createColmapToViewer, createViewerGeometry } from "./colmapSpace";
import { prepareViewerViewport } from "./renderViewport";
import { useCameraViewControls } from "./useCameraViewControls";
import { useCameraImageOverlay } from "./useCameraImageOverlay";

type PointCloudViewerProps = {
  imageUrlByName?: Record<string, string>;
  plyUrl: string;
  cameras: ViewerCameraPose[];
};

export function PointCloudViewer({ imageUrlByName, plyUrl, cameras }: PointCloudViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraViewContextRef = useRef<CameraViewContext | null>(null);
  const cameraViewActiveRef = useRef(false);
  const manualControlStartRef = useRef<() => void>(() => undefined);
  const [error, setError] = useState("");
  const [sceneRevision, setSceneRevision] = useState(0);
  const getCameraViewContext = useCallback(() => cameraViewContextRef.current, []);
  const cameraView = useCameraViewControls(cameras, getCameraViewContext, sceneRevision);
  const cameraImage = useCameraImageOverlay({
    active: cameraView.active,
    cameras,
    getContext: getCameraViewContext,
    imageUrlByName,
    sceneRevision,
    selectedCamera: cameraView.selectedCamera,
  });

  cameraViewActiveRef.current = cameraView.active;
  manualControlStartRef.current = cameraView.handleManualControlStart;

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const targetCanvas = canvas;
    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let frame = 0;

    async function mount() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);

      const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10000);
      camera.up.set(0, 0, 1);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas: targetCanvas,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.autoClear = false;

      controls = new OrbitControls(camera, targetCanvas);
      controls.enableDamping = true;
      controls.screenSpacePanning = true;
      controls.minPolarAngle = 0.02;
      controls.maxPolarAngle = Math.PI - 0.02;
      controls.zoomToCursor = true;
      const mountedControls = controls;
      const handleControlStart = () => {
        manualControlStartRef.current();
      };
      mountedControls.addEventListener("start", handleControlStart);

      const loader = new PLYLoader();
      const geometry = await loader.loadAsync(plyUrl);

      if (disposed) {
        geometry.dispose();
        return;
      }

      const { center, radius, pointRadius } = computeRobustBounds(geometry, cameras);
      const colmapToViewer = createColmapToViewer(cameras);
      const viewerGeometry = createViewerGeometry(geometry, center, colmapToViewer);

      const hasColor = Boolean(geometry.getAttribute("color"));
      const material = new THREE.PointsMaterial({
        size: Math.max(pointRadius / 700, 0.004),
        sizeAttenuation: true,
        vertexColors: hasColor,
        color: hasColor ? 0xffffff : 0x1d1f23,
      });
      const points = new THREE.Points(viewerGeometry, material);
      scene.add(points);

      const disposeCameraHelpers = addCameraHelpers(scene, cameras, center, colmapToViewer);
      const parentWidth = targetCanvas.parentElement?.clientWidth ?? 1;
      const parentHeight = targetCanvas.parentElement?.clientHeight ?? 1;
      const defaultView = createDefaultOrbitView(radius, parentWidth / Math.max(parentHeight, 1));

      camera.near = Math.max(radius / 1000, 0.001);
      camera.far = Math.max(radius * 100, 1000);
      applyCameraView(camera, controls, defaultView);
      cameraViewContextRef.current = {
        camera,
        center,
        colmapToViewer,
        controls,
        defaultView,
        radius,
        scene,
      };
      setSceneRevision((current) => current + 1);

      const resize = () => {
        if (!renderer || !targetCanvas.parentElement) {
          return;
        }

        const width = targetCanvas.parentElement.clientWidth;
        const height = targetCanvas.parentElement.clientHeight;
        renderer.setSize(width, height, false);
        if (!cameraViewActiveRef.current) {
          camera.aspect = width / Math.max(height, 1);
          if (cameraViewContextRef.current) {
            cameraViewContextRef.current.defaultView.aspect = camera.aspect;
          }
        }
        camera.updateProjectionMatrix();
      };

      const render = () => {
        if (!renderer || !controls) {
          return;
        }

        controls.update();
        prepareViewerViewport(renderer, camera, cameraViewActiveRef.current);
        renderer.render(scene, camera);
        frame = window.requestAnimationFrame(render);
      };

      window.addEventListener("resize", resize);
      resize();
      render();

      return () => {
        window.removeEventListener("resize", resize);
        geometry.dispose();
        viewerGeometry.dispose();
        material.dispose();
        disposeCameraHelpers();
        mountedControls.removeEventListener("start", handleControlStart);
      };
    }

    let cleanup: (() => void) | undefined;
    mount()
      .then((nextCleanup) => {
        cleanup = nextCleanup;
      })
      .catch((mountError: unknown) => {
        setError(mountError instanceof Error ? mountError.message : "Не удалось открыть 3D viewer.");
      });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      cleanup?.();
      controls?.dispose();
      renderer?.dispose();
      cameraViewContextRef.current = null;
    };
  }, [cameras, plyUrl]);

  return (
    <div className="point-viewer">
      <canvas ref={canvasRef} />
      <div className="viewer-badge">WEBGL</div>
      {cameras.length > 0 ? (
        <CameraViewControls
          active={cameraView.active}
          cameraCount={cameras.length}
          imageAvailable={cameraImage.selectedImageAvailable}
          imageVisible={cameraImage.showImage}
          selectedCamera={cameraView.selectedCamera}
          onImageVisibleChange={cameraImage.setShowImage}
          onSelectedCameraChange={cameraView.setSelectedCamera}
          onToggleActive={cameraView.toggleCameraView}
        />
      ) : null}
      {error ? <p className="viewer-error">{error}</p> : null}
    </div>
  );
}
