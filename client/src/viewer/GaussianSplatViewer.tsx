import { useMemo, useRef, useState } from "react";
import type { ViewerCameraPose } from "../types";
import { ColmapViewerCore } from "./ColmapViewerCore";
import { createGaussianSplatLayer } from "./gaussianSplatLayer";

type GaussianSplatViewerProps = {
  cameras: ViewerCameraPose[];
  colmapPlyUrl: string | null;
  gsplatPlyUrl: string;
  imageUrlByName?: Record<string, string>;
  modelToColmap?: number[];
  splatCoverageScale?: number;
};

const identityModelToColmap = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function GaussianSplatViewer({
  cameras,
  colmapPlyUrl,
  gsplatPlyUrl,
  imageUrlByName,
  modelToColmap = identityModelToColmap,
  splatCoverageScale = 1,
}: GaussianSplatViewerProps) {
  const [showSplats, setShowSplats] = useState(true);
  const [splatError, setSplatError] = useState("");
  const [splatProgress, setSplatProgress] = useState(0);
  const [splatStatus, setSplatStatus] = useState("");
  const showSplatsRef = useRef(showSplats);
  showSplatsRef.current = showSplats;

  const layers = useMemo(
    () => [
      createGaussianSplatLayer({
        modelToColmap,
        onError: setSplatError,
        onProgress: setSplatProgress,
        onStatus: setSplatStatus,
        plyUrl: gsplatPlyUrl,
        splatCoverageScale,
        visibleRef: showSplatsRef,
      }),
    ],
    [gsplatPlyUrl, modelToColmap, splatCoverageScale]
  );

  if (!colmapPlyUrl) {
    return (
      <div className="point-viewer">
        <p className="viewer-error">Для 3DGS viewer нужен COLMAP point cloud.</p>
      </div>
    );
  }

  return (
    <ColmapViewerCore
      badge="3DGS"
      cameras={cameras}
      className="gaussian-viewer"
      extraLayerControls={
        <button
          aria-pressed={showSplats}
          className={showSplats ? "camera-view-toggle is-active" : "camera-view-toggle"}
          type="button"
          onClick={() => setShowSplats((current) => !current)}
        >
          Сплаты
        </button>
      }
      extraOverlay={
        <>
          {splatProgress > 0 && splatProgress < 100 ? (
            <div className="viewer-loading">Загрузка splats: {splatProgress}%</div>
          ) : null}
          {splatStatus ? <div className="viewer-badge viewer-badge-secondary">{splatStatus}</div> : null}
          {splatError ? <p className="viewer-error">{splatError}</p> : null}
        </>
      }
      imageUrlByName={imageUrlByName}
      initialCamerasVisible={false}
      initialPointCloudVisible={false}
      layers={layers}
      plyUrl={colmapPlyUrl}
      showCamerasControl
      showPointCloudControl
      transparent
    />
  );
}
