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

type LivePlyViewerProps = {
  imageUrlByName?: Record<string, string>;
  plyUrl: string;
  cameras: ViewerCameraPose[];
  version: string;
};

type SceneContext = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
};

function disposePoints(points: THREE.Points | null) {
  if (!points) {
    return;
  }

  points.geometry.dispose();

  if (Array.isArray(points.material)) {
    for (const material of points.material) {
      material.dispose();
    }
  } else {
    points.material.dispose();
  }
}

export function LivePlyViewer({ imageUrlByName, plyUrl, cameras, version }: LivePlyViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<SceneContext | null>(null);
  const cameraViewContextRef = useRef<CameraViewContext | null>(null);
  const cameraViewActiveRef = useRef(false);
  const manualControlStartRef = useRef<() => void>(() => undefined);
  const pointsRef = useRef<THREE.Points | null>(null);
  const disposeCameraHelpersRef = useRef<(() => void) | null>(null);
  const loadIdRef = useRef(0);
  const hasFitRef = useRef(false);
  const userMovedRef = useRef(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
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

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10000);
    camera.up.set(0, 0, 1);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    controls.zoomToCursor = true;
    const handleControlStart = () => {
      userMovedRef.current = true;
      manualControlStartRef.current();
    };
    controls.addEventListener("start", handleControlStart);

    contextRef.current = { camera, controls, renderer, scene };

    const resize = () => {
      const parent = canvas.parentElement;

      if (!parent) {
        return;
      }

      const width = parent.clientWidth;
      const height = parent.clientHeight;

      renderer.setSize(width, height, false);
      if (!cameraViewActiveRef.current) {
        camera.aspect = width / Math.max(height, 1);
        if (cameraViewContextRef.current) {
          cameraViewContextRef.current.defaultView.aspect = camera.aspect;
        }
      }
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    let frame = 0;

    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }

    const render = () => {
      controls.update();
      prepareViewerViewport(renderer, camera, cameraViewActiveRef.current);
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };

    resize();
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      disposeCameraHelpersRef.current?.();
      disposePoints(pointsRef.current);
      controls.removeEventListener("start", handleControlStart);
      controls.dispose();
      renderer.dispose();
      contextRef.current = null;
      cameraViewContextRef.current = null;
      pointsRef.current = null;
      disposeCameraHelpersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const context = contextRef.current;

    if (!context) {
      return undefined;
    }

    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    let cancelled = false;

    if (!pointsRef.current) {
      setLoading(true);
    }
    setError("");

    const loader = new PLYLoader();

    loader
      .loadAsync(plyUrl)
      .then((geometry) => {
        if (cancelled || loadId !== loadIdRef.current) {
          geometry.dispose();
          return;
        }

        const { camera, controls, scene } = context;
        const { center, radius, pointRadius } = computeRobustBounds(geometry, cameras);
        const colmapToViewer = createColmapToViewer(cameras);
        const parentWidth = context.renderer.domElement.parentElement?.clientWidth ?? 1;
        const parentHeight = context.renderer.domElement.parentElement?.clientHeight ?? 1;
        const defaultView = createDefaultOrbitView(radius, parentWidth / Math.max(parentHeight, 1));
        const viewerGeometry = createViewerGeometry(geometry, center, colmapToViewer);
        const hasColor = Boolean(geometry.getAttribute("color"));
        const material = new THREE.PointsMaterial({
          color: hasColor ? 0xffffff : 0xe7edf3,
          size: Math.max(pointRadius / 700, 0.004),
          sizeAttenuation: true,
          vertexColors: hasColor,
        });
        const points = new THREE.Points(viewerGeometry, material);

        geometry.dispose();
        disposeCameraHelpersRef.current?.();

        if (pointsRef.current) {
          scene.remove(pointsRef.current);
          disposePoints(pointsRef.current);
        }

        pointsRef.current = points;
        scene.add(points);
        disposeCameraHelpersRef.current = addCameraHelpers(scene, cameras, center, colmapToViewer);

        camera.near = Math.max(radius / 1000, 0.001);
        camera.far = Math.max(radius * 100, 1000);
        camera.updateProjectionMatrix();
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

        if ((!hasFitRef.current || !userMovedRef.current) && !cameraViewActiveRef.current) {
          applyCameraView(camera, controls, defaultView);
          hasFitRef.current = true;
        }

        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (cancelled || loadId !== loadIdRef.current) {
          return;
        }

        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить live PLY.");
      });

    return () => {
      cancelled = true;
    };
  }, [cameras, plyUrl, version]);

  return (
    <div className="live-ply-viewer">
      <canvas ref={canvasRef} />
      <div className="viewer-badge">LIVE PLY</div>
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
      {loading ? <div className="viewer-loading">Загружаю live preview...</div> : null}
      {error ? <p className="viewer-error">{error}</p> : null}
    </div>
  );
}
