import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import type { ViewerCameraPose } from "../types";
import { CameraViewControls } from "./CameraViewControls";
import { applyCameraView, createDefaultOrbitView, type CameraViewContext } from "./cameraView";
import { addCameraHelpers, computeRobustBounds, createColmapToViewer, createViewerGeometry } from "./colmapSpace";
import { prepareViewerViewport } from "./renderViewport";
import { useCameraImageOverlay } from "./useCameraImageOverlay";
import { useCameraViewControls } from "./useCameraViewControls";

export type ColmapViewerLayerContext = CameraViewContext & {
  canvas: HTMLCanvasElement;
  cameraViewActiveRef: RefObject<boolean>;
  container: HTMLDivElement;
  renderer: THREE.WebGLRenderer;
};

export type ColmapViewerLayer = {
  mount: (context: ColmapViewerLayerContext) => void | (() => void);
  render?: (context: ColmapViewerLayerContext) => void;
};

type ColmapViewerCoreProps = {
  badge: string;
  cameras: ViewerCameraPose[];
  className?: string;
  extraLayerControls?: ReactNode;
  extraOverlay?: ReactNode;
  imageUrlByName?: Record<string, string>;
  initialCamerasVisible?: boolean;
  initialPointCloudVisible?: boolean;
  layers?: ColmapViewerLayer[];
  plyUrl: string;
  showCamerasControl?: boolean;
  showPointCloudControl?: boolean;
  transparent?: boolean;
};

const emptyLayers: ColmapViewerLayer[] = [];

export function ColmapViewerCore({
  badge,
  cameras,
  className = "",
  extraLayerControls,
  extraOverlay,
  imageUrlByName,
  initialCamerasVisible = true,
  initialPointCloudVisible = true,
  layers = emptyLayers,
  plyUrl,
  showCamerasControl = false,
  showPointCloudControl = false,
  transparent = false,
}: ColmapViewerCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<ColmapViewerLayerContext | null>(null);
  const cameraViewActiveRef = useRef(false);
  const manualControlStartRef = useRef<() => void>(() => undefined);
  const pointCloudRef = useRef<THREE.Points | null>(null);
  const pointCloudVisibleRef = useRef(initialPointCloudVisible);
  const disposeCameraHelpersRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [pointCloudVisible, setPointCloudVisible] = useState(initialPointCloudVisible);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [showCameras, setShowCameras] = useState(initialCamerasVisible);
  const getCameraViewContext = useCallback(() => contextRef.current, []);
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
  pointCloudVisibleRef.current = pointCloudVisible;

  useEffect(() => {
    if (pointCloudRef.current) {
      pointCloudRef.current.visible = pointCloudVisible;
    }
  }, [pointCloudVisible, sceneRevision]);

  useEffect(() => {
    const context = contextRef.current;

    disposeCameraHelpersRef.current?.();
    disposeCameraHelpersRef.current = null;

    if (!showCameras || !context || cameras.length === 0) {
      return undefined;
    }

    disposeCameraHelpersRef.current = addCameraHelpers(context.scene, cameras, context.center, context.colmapToViewer);

    return () => {
      disposeCameraHelpersRef.current?.();
      disposeCameraHelpersRef.current = null;
    };
  }, [cameras, sceneRevision, showCameras]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const targetContainer = container;
    const canvas = document.createElement("canvas");
    canvas.className = "viewer-canvas colmap-viewer-canvas";
    targetContainer.replaceChildren(canvas);

    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let layerCleanups: Array<() => void> = [];

    async function mount() {
      const scene = new THREE.Scene();
      scene.background = transparent ? null : new THREE.Color(0x000000);

      const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10000);
      camera.up.set(0, 0, 1);

      renderer = new THREE.WebGLRenderer({ alpha: transparent, antialias: true, canvas, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, transparent ? 0 : 1);

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.screenSpacePanning = true;
      controls.minPolarAngle = 0.02;
      controls.maxPolarAngle = Math.PI - 0.02;
      controls.zoomToCursor = true;
      controls.addEventListener("start", () => manualControlStartRef.current());

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
        color: hasColor ? 0xffffff : 0x1d1f23,
        size: Math.max(pointRadius / 700, 0.004),
        sizeAttenuation: true,
        vertexColors: hasColor,
      });
      const points = new THREE.Points(viewerGeometry, material);
      points.visible = pointCloudVisibleRef.current;
      pointCloudRef.current = points;
      scene.add(points);

      const parentWidth = targetContainer.clientWidth || 1;
      const parentHeight = targetContainer.clientHeight || 1;
      const defaultView = createDefaultOrbitView(radius, parentWidth / Math.max(parentHeight, 1));

      camera.near = Math.max(radius / 1000, 0.001);
      camera.far = Math.max(radius * 100, 1000);
      applyCameraView(camera, controls, defaultView);

      const context: ColmapViewerLayerContext = {
        camera,
        cameraViewActiveRef,
        canvas,
        center,
        colmapToViewer,
        container: targetContainer,
        controls,
        defaultView,
        radius,
        renderer,
        scene,
      };
      contextRef.current = context;
      layerCleanups = layers.map((layer) => layer.mount(context)).filter(Boolean) as Array<() => void>;
      setSceneRevision((current) => current + 1);

      const resize = () => {
        if (!renderer) {
          return;
        }

        const width = targetContainer.clientWidth;
        const height = targetContainer.clientHeight;
        renderer.setSize(width, height, false);
        if (!cameraViewActiveRef.current) {
          camera.aspect = width / Math.max(height, 1);
          context.defaultView.aspect = camera.aspect;
        }
        camera.updateProjectionMatrix();
      };

      const render = () => {
        if (!renderer || !controls) {
          return;
        }

        controls.update();
        if (pointCloudRef.current) {
          pointCloudRef.current.visible = pointCloudVisibleRef.current;
        }
        for (const layer of layers) {
          layer.render?.(context);
        }
        prepareViewerViewport(renderer, camera, cameraViewActiveRef.current);
        renderer.render(scene, camera);
        frame = window.requestAnimationFrame(render);
      };

      window.addEventListener("resize", resize);
      resize();
      render();

      return () => {
        window.removeEventListener("resize", resize);
        layerCleanups.forEach((cleanup) => cleanup());
        geometry.dispose();
        viewerGeometry.dispose();
        material.dispose();
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
      disposeCameraHelpersRef.current?.();
      pointCloudRef.current = null;
      contextRef.current = null;
      targetContainer.replaceChildren();
    };
  }, [cameras, layers, plyUrl, transparent]);

  return (
    <div className={`point-viewer ${className}`}>
      <div className="viewer-canvas-stack" ref={containerRef} />
      <div className="viewer-badge">{badge}</div>
      {showPointCloudControl || showCamerasControl || extraLayerControls ? (
        <div className="viewer-layer-controls" onPointerDown={(event) => event.stopPropagation()}>
          {extraLayerControls}
          {showPointCloudControl ? (
            <button
              aria-pressed={pointCloudVisible}
              className={pointCloudVisible ? "camera-view-toggle is-active" : "camera-view-toggle"}
              type="button"
              onClick={() => setPointCloudVisible((current) => !current)}
            >
              Точки COLMAP
            </button>
          ) : null}
          {showCamerasControl ? (
            <button
              aria-pressed={showCameras}
              className={showCameras ? "camera-view-toggle is-active" : "camera-view-toggle"}
              type="button"
              onClick={() => setShowCameras((current) => !current)}
            >
              Камеры
            </button>
          ) : null}
        </div>
      ) : null}
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
      {extraOverlay}
      {error ? <p className="viewer-error">{error}</p> : null}
    </div>
  );
}
