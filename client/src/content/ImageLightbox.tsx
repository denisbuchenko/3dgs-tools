import type { ProjectImage } from "../types";
import { mediaUrl } from "../utils/media";

type ImageLightboxProps = {
  image: ProjectImage;
  isMenuOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onDelete: (image: ProjectImage) => void;
  onToggleMenu: () => void;
};

export function ImageLightbox({
  image,
  isMenuOpen,
  isSaving,
  onClose,
  onDelete,
  onToggleMenu,
}: ImageLightboxProps) {
  return (
    <div className="modal-backdrop image-backdrop" role="presentation">
      <div className="image-viewer">
        <div className="viewer-toolbar">
          <div className="image-menu-wrap">
            <button
              className="icon-button visible"
              type="button"
              aria-label="Действия с изображением"
              onClick={onToggleMenu}
            >
              ...
            </button>
            {isMenuOpen ? (
              <div className="image-menu">
                <button type="button" onClick={() => onDelete(image)} disabled={isSaving}>
                  Удалить
                </button>
              </div>
            ) : null}
          </div>
          <button className="close-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <img src={mediaUrl(image.originalUrl)} alt="" />
      </div>
    </div>
  );
}
