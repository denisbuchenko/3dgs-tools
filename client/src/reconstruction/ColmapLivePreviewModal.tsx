import type { ColmapLivePly } from "../types";
import { LivePlyViewer } from "../viewer/LivePlyViewer";

type ColmapLivePreviewModalProps = {
  livePly: ColmapLivePly | null;
  plyUrl: string | null;
  onClose: () => void;
};

export function ColmapLivePreviewModal({ livePly, plyUrl, onClose }: ColmapLivePreviewModalProps) {
  return (
    <div className="modal-backdrop result-backdrop" role="presentation">
      <div className="result-modal" aria-label="Live COLMAP preview">
        <header className="result-toolbar">
          <div>
            <h2>Live COLMAP preview</h2>
            <p className="viewer-subtitle">
              {livePly
                ? `${livePly.pointCount.toLocaleString("ru")} из ${livePly.totalPoints.toLocaleString("ru")} sparse точек, ${livePly.cameras.length} камер`
                : "Ожидаю промежуточную sparse model от mapping"}
            </p>
          </div>
          <button className="close-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        {livePly && plyUrl ? (
          <LivePlyViewer plyUrl={plyUrl} cameras={livePly.cameras} version={livePly.version} />
        ) : (
          <div className="point-viewer">
            <div className="viewer-loading">COLMAP ещё не сохранил промежуточные точки...</div>
          </div>
        )}
      </div>
    </div>
  );
}
