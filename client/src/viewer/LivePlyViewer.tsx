import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import type { ViewerCameraPose } from "../types";
import { addCameraHelpers, computeRobustBounds, createColmapToViewer, createViewerGeometry } from "./colmapSpace";

type LivePlyViewerProps = {
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

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, radius: number) {
  camera.position.set(radius * 1.6, -radius * 2.2, radius * 1.2);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(radius / 1000, 0.001);
  camera.far = Math.max(radius * 100, 1000);
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

export function LivePlyViewer({ plyUrl, cameras, version }: LivePlyViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<SceneContext | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const disposeCameraHelpersRef = useRef<(() => void) | null>(null);
  const loadIdRef = useRef(0);
  const hasFitRef = useRef(false);
  const userMovedRef = useRef(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
    controls.addEventListener("start", () => {
      userMovedRef.current = true;
    });

    contextRef.current = { camera, controls, renderer, scene };

    const resize = () => {
      const parent = canvas.parentElement;

      if (!parent) {
        return;
      }

      const width = parent.clientWidth;
      const height = parent.clientHeight;

      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    let frame = 0;

    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }

    const render = () => {
      controls.update();
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
      controls.dispose();
      renderer.dispose();
      contextRef.current = null;
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

        if (!hasFitRef.current || !userMovedRef.current) {
          fitCamera(camera, controls, radius);
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
      {loading ? <div className="viewer-loading">Загружаю live preview...</div> : null}
      {error ? <p className="viewer-error">{error}</p> : null}
    </div>
  );
}
