import { lazy, Suspense, useMemo } from "react";
import type { ColmapResult, ProjectImage, ResultMode } from "../types";
import { mediaUrl } from "../utils/media";

const PointCloudViewer = lazy(() =>
  import("../viewer/PointCloudViewer").then((module) => ({ default: module.PointCloudViewer }))
);
const GaussianSplatViewer = lazy(() =>
  import("../viewer/GaussianSplatViewer").then((module) => ({ default: module.GaussianSplatViewer }))
);

type ResultModalProps = {
  colmapResult: ColmapResult | null;
  images: ProjectImage[];
  plyUrl: string;
  resultMode: ResultMode;
  title: string;
  onClose: () => void;
};

export function ResultModal({ colmapResult, images, plyUrl, resultMode, title, onClose }: ResultModalProps) {
  const imageUrlByName = useMemo(
    () => Object.fromEntries(images.map((image) => [image.fileName, mediaUrl(image.originalUrl)])),
    [images]
  );

  return (
    <div className="modal-backdrop result-backdrop" role="presentation">
      <div className="result-modal" aria-label={title}>
        <header className="result-toolbar">
          <h2>{title}</h2>
          <button className="close-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <Suspense
          fallback={
            <div className="point-viewer">
              <div className="viewer-loading">Загрузка viewer...</div>
            </div>
          }
        >
          {resultMode === "gsplat" ? (
            <GaussianSplatViewer plyUrl={plyUrl} />
          ) : (
            <PointCloudViewer imageUrlByName={imageUrlByName} plyUrl={plyUrl} cameras={colmapResult?.cameras ?? []} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
