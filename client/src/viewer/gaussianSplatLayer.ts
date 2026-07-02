import * as SPLAT from "gsplat";
import type { RefObject } from "react";
import type { ColmapViewerLayer, ColmapViewerLayerContext } from "./ColmapViewerCore";
import { syncSplatCameraFromColmapViewer } from "./gaussianSplatCamera";
import { fitViewport } from "./renderViewport";

type GaussianSplatLayerOptions = {
  modelToColmap: number[];
  plyUrl: string;
  visibleRef: RefObject<boolean>;
  onError: (message: string) => void;
  onProgress: (progress: number) => void;
  onStatus: (status: string) => void;
};

function applySplatCanvasLayout(context: ColmapViewerLayerContext, canvas: HTMLCanvasElement) {
  const width = context.container.clientWidth;
  const height = context.container.clientHeight;
  const viewport = context.cameraViewActiveRef.current
    ? fitViewport(width, height, context.camera.aspect)
    : { x: 0, y: 0, width, height };

  canvas.style.left = `${viewport.x}px`;
  canvas.style.top = `${viewport.y}px`;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
}

export function createGaussianSplatLayer({
  modelToColmap,
  onError,
  onProgress,
  onStatus,
  plyUrl,
  visibleRef,
}: GaussianSplatLayerOptions): ColmapViewerLayer {
  let renderer: SPLAT.WebGLRenderer | null = null;
  let scene: SPLAT.Scene | null = null;
  let camera: SPLAT.Camera | null = null;
  let disposed = false;

  return {
    mount(context) {
      disposed = false;
      renderer = new SPLAT.WebGLRenderer();
      renderer.backgroundColor = new SPLAT.Color32(0, 0, 0, 255);
      renderer.canvas.className = "viewer-canvas gaussian-splat-canvas";
      renderer.canvas.style.zIndex = "0";
      context.canvas.style.zIndex = "1";
      context.container.insertBefore(renderer.canvas, context.canvas);

      scene = new SPLAT.Scene();
      camera = new SPLAT.Camera();

      const onLoadProgress = (nextProgress: number) => {
        if (!disposed) {
          onProgress(Math.round(nextProgress * 100));
        }
      };
      const load = plyUrl.toLowerCase().split("?")[0].endsWith(".splat")
        ? SPLAT.Loader.LoadAsync(plyUrl, scene, onLoadProgress)
        : SPLAT.PLYLoader.LoadAsync(plyUrl, scene, onLoadProgress);

      load
        .then((splat) => {
          if (disposed) {
            return;
          }

          onProgress(100);
          onStatus(`${splat.data.vertexCount.toLocaleString("ru-RU")} splats`);
        })
        .catch((error: unknown) => {
          if (!disposed) {
            onError(error instanceof Error ? error.message : "Не удалось загрузить gaussian splats.");
          }
        });

      return () => {
        disposed = true;
        renderer?.dispose();
        renderer?.canvas.remove();
        renderer = null;
        scene = null;
        camera = null;
      };
    },
    render(context) {
      if (!renderer || !scene || !camera) {
        return;
      }

      const visible = Boolean(visibleRef.current);
      renderer.canvas.style.display = visible ? "block" : "none";
      if (!visible) {
        return;
      }

      applySplatCanvasLayout(context, renderer.canvas);
      renderer.resize();
      syncSplatCameraFromColmapViewer({
        center: context.center,
        colmapToViewer: context.colmapToViewer,
        modelToColmap,
        splatCamera: camera,
        viewerCamera: context.camera,
      });
      renderer.render(scene, camera);
    },
  };
}
