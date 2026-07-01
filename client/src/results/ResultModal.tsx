import { lazy, Suspense } from "react";
import type { ColmapResult, ResultMode } from "../types";

const PointCloudViewer = lazy(() =>
  import("../viewer/PointCloudViewer").then((module) => ({ default: module.PointCloudViewer }))
);
const GaussianSplatViewer = lazy(() =>
  import("../viewer/GaussianSplatViewer").then((module) => ({ default: module.GaussianSplatViewer }))
);

type ResultModalProps = {
  colmapResult: ColmapResult | null;
  plyUrl: string;
  resultMode: ResultMode;
  title: string;
  onClose: () => void;
};

export function ResultModal({ colmapResult, plyUrl, resultMode, title, onClose }: ResultModalProps) {
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
            <PointCloudViewer plyUrl={plyUrl} cameras={colmapResult?.cameras ?? []} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
