import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

export type ViewerCameraPose = {
  id: number;
  name: string;
  cameraId: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
};

type RendererMode = "webgpu" | "webgl";
type ViewerRenderer = THREE.WebGLRenderer & {
  init?: () => Promise<void>;
};

type PointCloudViewerProps = {
  plyUrl: string;
  cameras: ViewerCameraPose[];
};

async function createRenderer(canvas: HTMLCanvasElement): Promise<{
  renderer: ViewerRenderer;
  mode: RendererMode;
}> {
  if ("gpu" in navigator) {
    try {
      const webgpu = await import("three/webgpu");
      const Renderer = webgpu.WebGPURenderer as unknown as new (parameters: {
        canvas: HTMLCanvasElement;
        antialias: boolean;
      }) => ViewerRenderer;
      const renderer = new Renderer({ canvas, antialias: true });

      if (renderer.init) {
        await renderer.init();
      }

      return { renderer, mode: "webgpu" };
    } catch {
      // Fall back to WebGL when the browser exposes WebGPU but Three cannot initialize it.
    }
  }

  return {
    renderer: new THREE.WebGLRenderer({ canvas, antialias: true }) as ViewerRenderer,
    mode: "webgl",
  };
}

function addCameraHelpers(scene: THREE.Object3D, cameras: ViewerCameraPose[]) {
  const material = new THREE.LineBasicMaterial({ color: 0x2f6f8f });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.18, -0.12, 0.3),
    new THREE.Vector3(0.18, -0.12, 0.3),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.18, 0.12, 0.3),
    new THREE.Vector3(-0.18, 0.12, 0.3),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.18, -0.12, 0.3),
    new THREE.Vector3(-0.18, 0.12, 0.3),
    new THREE.Vector3(0.18, 0.12, 0.3),
    new THREE.Vector3(0.18, -0.12, 0.3),
  ]);

  for (const cameraPose of cameras) {
    const helper = new THREE.Line(geometry, material);
    helper.position.fromArray(cameraPose.position);
    helper.quaternion.fromArray(cameraPose.rotation);
    helper.scale.setScalar(0.35);
    scene.add(helper);
  }
}

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) {
    return 0;
  }

  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function computeRobustBounds(geometry: THREE.BufferGeometry, cameras: ViewerCameraPose[]) {
  const positions = geometry.getAttribute("position");

  if (!positions) {
    const center = new THREE.Vector3();
    return { center, radius: 1, pointRadius: 1 };
  }

  const step = Math.max(1, Math.floor(positions.count / 20000));
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];

  for (let index = 0; index < positions.count; index += step) {
    xs.push(positions.getX(index));
    ys.push(positions.getY(index));
    zs.push(positions.getZ(index));
  }

  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);

  const center = new THREE.Vector3(percentile(xs, 0.5), percentile(ys, 0.5), percentile(zs, 0.5));
  const distances: number[] = [];

  for (let index = 0; index < positions.count; index += step) {
    distances.push(
      Math.hypot(
        positions.getX(index) - center.x,
        positions.getY(index) - center.y,
        positions.getZ(index) - center.z
      )
    );
  }

  distances.sort((a, b) => a - b);

  const pointRadius = Math.max(percentile(distances, 0.98), 1);
  const cameraRadius = cameras.reduce((current, cameraPose) => {
    const cameraPosition = new THREE.Vector3().fromArray(cameraPose.position);

    return Math.max(current, cameraPosition.distanceTo(center));
  }, 0);
  const radius = Math.max(pointRadius, cameraRadius * 1.15, 1);

  return { center, radius, pointRadius };
}

export function PointCloudViewer({ plyUrl, cameras }: PointCloudViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<RendererMode>("webgl");
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const targetCanvas = canvas;
    let disposed = false;
    let renderer: ViewerRenderer | null = null;
    let controls: OrbitControls | null = null;
    let frame = 0;

    async function mount() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);

      const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10000);
      camera.position.set(0, -4, 2);

      const renderSetup = await createRenderer(targetCanvas);
      renderer = renderSetup.renderer;
      setMode(renderSetup.mode);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      controls = new OrbitControls(camera, targetCanvas);
      controls.enableDamping = true;

      const loader = new PLYLoader();
      const geometry = await loader.loadAsync(plyUrl);

      if (disposed) {
        geometry.dispose();
        return;
      }

      const { center, radius, pointRadius } = computeRobustBounds(geometry, cameras);
      geometry.translate(-center.x, -center.y, -center.z);

      const hasColor = Boolean(geometry.getAttribute("color"));
      const material = new THREE.PointsMaterial({
        size: Math.max(pointRadius / 700, 0.004),
        sizeAttenuation: true,
        vertexColors: hasColor,
        color: hasColor ? 0xffffff : 0x1d1f23,
      });
      const points = new THREE.Points(geometry, material);
      scene.add(points);

      const cameraGroup = new THREE.Group();
      cameraGroup.position.set(-center.x, -center.y, -center.z);
      addCameraHelpers(cameraGroup, cameras);
      scene.add(cameraGroup);

      camera.position.set(0, -radius * 2.6, radius * 1.2);
      camera.near = Math.max(radius / 1000, 0.001);
      camera.far = Math.max(radius * 100, 1000);
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);

      const resize = () => {
        if (!renderer || !targetCanvas.parentElement) {
          return;
        }

        const width = targetCanvas.parentElement.clientWidth;
        const height = targetCanvas.parentElement.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
      };

      const render = () => {
        if (!renderer || !controls) {
          return;
        }

        controls.update();
        renderer.render(scene, camera);
        frame = window.requestAnimationFrame(render);
      };

      window.addEventListener("resize", resize);
      resize();
      render();

      return () => {
        window.removeEventListener("resize", resize);
        geometry.dispose();
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
    };
  }, [cameras, plyUrl]);

  return (
    <div className="point-viewer">
      <canvas ref={canvasRef} />
      <div className="viewer-badge">{mode.toUpperCase()}</div>
      {error ? <p className="viewer-error">{error}</p> : null}
    </div>
  );
}
