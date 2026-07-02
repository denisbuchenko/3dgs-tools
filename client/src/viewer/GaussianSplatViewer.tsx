import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as SPLAT from "gsplat";
import * as THREE from "three";
import type { ViewerCameraPose } from "../types";
import { CameraViewControls } from "./CameraViewControls";
import {
  animateSplatCameraView,
  createSplatCameraView,
  fitSplatCamera,
  getSplatSceneInfo,
  matrixFromRowMajor,
  splatFitDirection,
  syncOverlayCamera,
  type SplatSceneInfo,
} from "./gaussianSplatCamera";
import {
  disposeGaussianOverlay,
  mountGaussianColmapOverlay,
  updateGaussianOverlayCameras,
  type GaussianOverlayState,
} from "./gaussianSplatOverlay";

type GaussianSplatViewerProps = {
  cameras: ViewerCameraPose[];
  colmapPlyUrl: string | null;
  gsplatPlyUrl: string;
  imageUrlByName?: Record<string, string>;
  modelToColmap?: number[];
};

const identityModelToColmap = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function GaussianSplatViewer({
  cameras,
  colmapPlyUrl,
  gsplatPlyUrl,
  modelToColmap = identityModelToColmap,
}: GaussianSplatViewerProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<GaussianOverlayState | null>(null);
  const cancelCameraAnimationRef = useRef<(() => void) | null>(null);
  const defaultSplatTargetRef = useRef(new SPLAT.Vector3());
  const sceneInfoRef = useRef<SplatSceneInfo | null>(null);
  const showColmapPointsRef = useRef(false);
  const showSplatsRef = useRef(true);
  const splatCameraRef = useRef<SPLAT.Camera | null>(null);
  const splatControlsRef = useRef<SPLAT.OrbitControls | null>(null);
  const splatTargetRef = useRef(new SPLAT.Vector3());
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [showCameras, setShowCameras] = useState(false);
  const [showColmapPoints, setShowColmapPoints] = useState(false);
  const [showSplats, setShowSplats] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedCamera, setSelectedCamera] = useState(1);
  const [cameraViewActive, setCameraViewActive] = useState(false);
  const cameraCount = cameras.length;
  const colmapToSplatMatrix = useMemo(() => matrixFromRowMajor(modelToColmap).invert(), [modelToColmap]);

  showColmapPointsRef.current = showColmapPoints;
  showSplatsRef.current = showSplats;

  const clampCameraNumber = useCallback(
    (cameraNumber: number) => Math.min(Math.max(1, cameraNumber), Math.max(cameraCount, 1)),
    [cameraCount]
  );

  useEffect(() => {
    setSelectedCamera((current) => clampCameraNumber(current));
  }, [clampCameraNumber]);

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return undefined;
    }

    const targetSurface = surface;
    let disposed = false;
    let frame = 0;

    const renderer = new SPLAT.WebGLRenderer();
    renderer.backgroundColor = new SPLAT.Color32(0, 0, 0, 255);
    renderer.canvas.className = "viewer-canvas gaussian-splat-canvas";
    renderer.canvas.tabIndex = 0;
    targetSurface.replaceChildren(renderer.canvas);

    const scene = new SPLAT.Scene();
    const camera = new SPLAT.Camera();
    const controls = new SPLAT.OrbitControls(camera, renderer.canvas, 0.5, 0.2, 5, false);
    const overlayCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 10000);
    splatCameraRef.current = camera;
    splatControlsRef.current = controls;
    controls.minAngle = -179;
    controls.maxAngle = 179;
    controls.orbitSpeed = 1;
    controls.panSpeed = 1;
    controls.zoomSpeed = 1;
    controls.dampening = 0.16;

    async function mountOverlay() {
      if (!colmapPlyUrl) {
        return;
      }

      const overlay = await mountGaussianColmapOverlay({
        cameras,
        colmapPlyUrl,
        colmapToSplat: colmapToSplatMatrix,
        surface: targetSurface,
      });

      if (disposed) {
        disposeGaussianOverlay(overlay);
        return;
      }

      overlayRef.current = overlay;
      updateGaussianOverlayCameras(overlay, cameras, showCameras);
    }

    async function loadScene() {
      setError("");
      setProgress(0);
      setStatus("");

      const onProgress = (nextProgress: number) => {
        if (!disposed) {
          setProgress(Math.round(nextProgress * 100));
        }
      };

      const splat = gsplatPlyUrl.toLowerCase().split("?")[0].endsWith(".splat")
        ? await SPLAT.Loader.LoadAsync(gsplatPlyUrl, scene, onProgress)
        : await SPLAT.PLYLoader.LoadAsync(gsplatPlyUrl, scene, onProgress);

      if (disposed) {
        return;
      }

      const vertexCount = splat.data.vertexCount;
      if (vertexCount <= 0) {
        throw new Error("3DGS файл загрузился, но в нём нет splats.");
      }

      const sceneInfo = getSplatSceneInfo(scene);
      sceneInfoRef.current = sceneInfo;
      defaultSplatTargetRef.current = sceneInfo.center;
      splatTargetRef.current = sceneInfo.center;
      fitSplatCamera(camera, controls, sceneInfo);
      setProgress(100);
      setStatus(`${vertexCount.toLocaleString("ru-RU")} splats`);
    }

    function render() {
      if (disposed) {
        return;
      }

      renderer.canvas.style.display = showSplatsRef.current ? "block" : "none";
      renderer.resize();
      controls.update();

      if (showSplatsRef.current) {
        renderer.render(scene, camera);
      }

      const overlay = overlayRef.current;
      if (overlay) {
        const width = targetSurface.clientWidth;
        const height = targetSurface.clientHeight;
        overlay.pointCloud.visible = showColmapPointsRef.current;
        overlay.renderer.setSize(width, height, false);
        syncOverlayCamera(camera, overlayCamera);
        overlay.renderer.clear(true, true, true);
        overlay.renderer.render(overlay.scene, overlayCamera);
      }

      frame = window.requestAnimationFrame(render);
    }

    void mountOverlay().catch((overlayError: unknown) => {
      if (!disposed) {
        setError(overlayError instanceof Error ? overlayError.message : "Не удалось загрузить COLMAP overlay.");
      }
    });
    void loadScene().catch((loadError: unknown) => {
      if (!disposed) {
        setError(loadError instanceof Error ? loadError.message : "Не удалось открыть 3DGS viewer.");
      }
    });
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      cancelCameraAnimationRef.current?.();
      cancelCameraAnimationRef.current = null;
      controls.dispose();
      renderer.dispose();
      disposeGaussianOverlay(overlayRef.current);
      overlayRef.current = null;
      splatCameraRef.current = null;
      splatControlsRef.current = null;
      targetSurface.replaceChildren();
    };
  }, [cameras, colmapPlyUrl, colmapToSplatMatrix, gsplatPlyUrl]);

  useEffect(() => {
    updateGaussianOverlayCameras(overlayRef.current, cameras, showCameras);
  }, [cameras, showCameras]);

  useEffect(() => {
    const camera = splatCameraRef.current;
    const controls = splatControlsRef.current;
    const sceneInfo = sceneInfoRef.current;

    cancelCameraAnimationRef.current?.();
    cancelCameraAnimationRef.current = null;

    if (!camera || !controls || !sceneInfo) {
      return undefined;
    }

    if (!cameraViewActive) {
      const position = sceneInfo.center.add(splatFitDirection.multiply(sceneInfo.fitDistance));
      cancelCameraAnimationRef.current = animateSplatCameraView(
        camera,
        controls,
        splatTargetRef.current,
        position,
        defaultSplatTargetRef.current,
        (target) => {
          splatTargetRef.current = target;
          cancelCameraAnimationRef.current = null;
        }
      );
      return undefined;
    }

    const cameraPose = cameras[selectedCamera - 1];

    if (!cameraPose) {
      return undefined;
    }

    const view = createSplatCameraView(cameraPose, colmapToSplatMatrix, sceneInfo);
    cancelCameraAnimationRef.current = animateSplatCameraView(
      camera,
      controls,
      splatTargetRef.current,
      view.position,
      view.target,
      (target) => {
        splatTargetRef.current = target;
        cancelCameraAnimationRef.current = null;
      }
    );

    return undefined;
  }, [cameraViewActive, cameras, colmapToSplatMatrix, selectedCamera]);

  return (
    <div className="point-viewer gaussian-viewer">
      <div className="gaussian-viewer-surface" ref={surfaceRef} />
      <div className="viewer-layer-controls">
        <button
          aria-pressed={showSplats}
          className={showSplats ? "camera-view-toggle is-active" : "camera-view-toggle"}
          type="button"
          onClick={() => setShowSplats((current) => !current)}
        >
          Сплаты
        </button>
        <button
          aria-pressed={showColmapPoints}
          className={showColmapPoints ? "camera-view-toggle is-active" : "camera-view-toggle"}
          disabled={!colmapPlyUrl}
          type="button"
          onClick={() => setShowColmapPoints((current) => !current)}
        >
          Точки COLMAP
        </button>
      </div>
      <CameraViewControls
        active={cameraViewActive}
        cameraCount={cameraCount}
        imageAvailable={false}
        imageVisible={false}
        selectedCamera={selectedCamera}
        showCameras={showCameras}
        onImageVisibleChange={() => undefined}
        onSelectedCameraChange={(cameraNumber) => setSelectedCamera(clampCameraNumber(cameraNumber))}
        onShowCamerasChange={setShowCameras}
        onToggleActive={() => setCameraViewActive((current) => !current)}
      />
      {progress > 0 && progress < 100 ? (
        <div className="viewer-loading">Загрузка splats: {progress}%</div>
      ) : null}
      {status ? <div className="viewer-badge viewer-badge-secondary">{status}</div> : null}
      {error ? <p className="viewer-error">{error}</p> : null}
    </div>
  );
}
