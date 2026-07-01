import { useMemo } from "react";
import type { ColmapLivePly, ProjectImage } from "../types";
import { mediaUrl } from "../utils/media";
import { LivePlyViewer } from "../viewer/LivePlyViewer";

type ColmapLivePreviewModalProps = {
  images: ProjectImage[];
  livePly: ColmapLivePly | null;
  plyUrl: string | null;
  onClose: () => void;
};

export function ColmapLivePreviewModal({ images, livePly, plyUrl, onClose }: ColmapLivePreviewModalProps) {
  const imageUrlByName = useMemo(
    () => Object.fromEntries(images.map((image) => [image.fileName, mediaUrl(image.originalUrl)])),
    [images]
  );

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
          <LivePlyViewer
            imageUrlByName={imageUrlByName}
            plyUrl={plyUrl}
            cameras={livePly.cameras}
            version={livePly.version}
          />
        ) : (
          <div className="point-viewer">
            <div className="viewer-loading">COLMAP ещё не сохранил промежуточные точки...</div>
          </div>
        )}
      </div>
    </div>
  );
}
