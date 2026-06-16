import { useEffect, useRef, useState } from "react";
import * as SPLAT from "gsplat";

type GaussianSplatViewerProps = {
  plyUrl: string;
};

const fitDirection = new SPLAT.Vector3(0.72, 0.38, 1).normalize();

function createLookRotation(position: SPLAT.Vector3, target: SPLAT.Vector3) {
  const direction = target.subtract(position).normalize();
  const rx = Math.asin(-direction.y);
  const ry = Math.atan2(direction.x, direction.z);

  return SPLAT.Quaternion.FromEuler(new SPLAT.Vector3(rx, ry, 0));
}

function getSceneInfo(scene: SPLAT.Scene) {
  let min: SPLAT.Vector3 | null = null;
  let max: SPLAT.Vector3 | null = null;

  for (const object of scene.objects) {
    if (object instanceof SPLAT.Splat) {
      const bounds = object.bounds;

      if (!min || !max) {
        min = bounds.min.clone();
        max = bounds.max.clone();
      } else {
        min = min.min(bounds.min);
        max = max.max(bounds.max);
      }
    }
  }

  if (!min || !max) {
    return {
      center: new SPLAT.Vector3(0, 0, 0),
      fitDistance: 4,
      maxDimension: 2,
    };
  }

  const size = max.subtract(min);
  const maxDimension = Math.max(size.x, size.y, size.z, 0.25);

  return {
    center: min.add(max).divide(2),
    fitDistance: Math.max(maxDimension * 1.8, 2),
    maxDimension,
  };
}

function fitCamera(camera: SPLAT.Camera, controls: SPLAT.OrbitControls, scene: SPLAT.Scene) {
  const info = getSceneInfo(scene);
  const position = info.center.add(fitDirection.multiply(info.fitDistance));

  camera.position = position;
  camera.rotation = createLookRotation(position, info.center);
  controls.setCameraTarget(info.center);
  controls.minZoom = Math.max(info.maxDimension * 0.03, 0.05);
  controls.maxZoom = Math.max(info.maxDimension * 12, 10);
}

export function GaussianSplatViewer({ plyUrl }: GaussianSplatViewerProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return undefined;
    }

    let disposed = false;
    let frame = 0;

    const renderer = new SPLAT.WebGLRenderer();
    renderer.backgroundColor = new SPLAT.Color32(0, 0, 0, 255);
    renderer.canvas.tabIndex = 0;
    surface.replaceChildren(renderer.canvas);

    const scene = new SPLAT.Scene();
    const camera = new SPLAT.Camera();
    const controls = new SPLAT.OrbitControls(camera, renderer.canvas, 0.5, 0.2, 5, false);
    controls.minAngle = -179;
    controls.maxAngle = 179;
    controls.orbitSpeed = 1;
    controls.panSpeed = 1;
    controls.zoomSpeed = 1;
    controls.dampening = 0.16;

    async function loadScene() {
      setError("");
      setProgress(0);
      setStatus("");

      const onProgress = (nextProgress: number) => {
        if (!disposed) {
          setProgress(Math.round(nextProgress * 100));
        }
      };

      const splat = plyUrl.toLowerCase().split("?")[0].endsWith(".splat")
        ? await SPLAT.Loader.LoadAsync(plyUrl, scene, onProgress)
        : await SPLAT.PLYLoader.LoadAsync(plyUrl, scene, onProgress);

      if (disposed) {
        return;
      }

      const vertexCount = splat.data.vertexCount;
      if (vertexCount <= 0) {
        throw new Error("3DGS файл загрузился, но в нём нет splats.");
      }

      fitCamera(camera, controls, scene);
      setProgress(100);
      setStatus(`${vertexCount.toLocaleString("ru-RU")} splats`);
    }

    function render() {
      if (disposed) {
        return;
      }

      renderer.resize();
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    }

    loadScene().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Не удалось открыть 3DGS viewer.");
    });
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      controls.dispose();
      renderer.dispose();
      surface.replaceChildren();
    };
  }, [plyUrl]);

  return (
    <div className="point-viewer gaussian-viewer">
      <div className="gaussian-viewer-surface" ref={surfaceRef} />
      {progress > 0 && progress < 100 ? (
        <div className="viewer-loading">Загрузка splats: {progress}%</div>
      ) : null}
      {status ? <div className="viewer-badge">{status}</div> : null}
      {error ? <p className="viewer-error">{error}</p> : null}
    </div>
  );
}
