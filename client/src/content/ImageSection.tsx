import type { ChangeEvent, RefObject } from "react";
import type { ProjectImage } from "../types";
import { mediaUrl } from "../utils/media";

type ImageSectionProps = {
  images: ProjectImage[];
  visibleImages: ProjectImage[];
  isImagesLoading: boolean;
  isSaving: boolean;
  isGalleryExpanded: boolean;
  openImageMenuId: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  onUploadImages: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenVideoModal: () => void;
  onDeleteAllImages: () => void;
  onOpenImage: (image: ProjectImage) => void;
  onToggleImageMenu: (imageId: string) => void;
  onDeleteImage: (image: ProjectImage) => void;
  onToggleGallery: () => void;
};

export function ImageSection({
  images,
  visibleImages,
  isImagesLoading,
  isSaving,
  isGalleryExpanded,
  openImageMenuId,
  fileInputRef,
  onUploadImages,
  onOpenVideoModal,
  onDeleteAllImages,
  onOpenImage,
  onToggleImageMenu,
  onDeleteImage,
  onToggleGallery,
}: ImageSectionProps) {
  return (
    <section className="images-section" aria-label="Изображения проекта">
      <div className="section-header">
        <div>
          <p className="eyebrow">Работа с изображениями</p>
          <h2>Изображения</h2>
        </div>
        <div className="image-actions">
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="image/*"
            multiple
            onChange={onUploadImages}
          />
          <button className="primary" type="button" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
            Добавить изображения
          </button>
          <button className="secondary" type="button" onClick={onOpenVideoModal} disabled={isSaving}>
            Добавить видео
          </button>
          <button className="ghost" type="button" onClick={onDeleteAllImages} disabled={isSaving || images.length === 0}>
            Удалить все изображения
          </button>
        </div>
      </div>

      {isImagesLoading ? <p className="side-note">Загрузка изображений...</p> : null}
      {!isImagesLoading && images.length === 0 ? <p className="side-note">Изображений пока нет</p> : null}

      {visibleImages.length > 0 ? (
        <div className="image-grid">
          {visibleImages.map((image) => (
            <div className="image-tile" key={image.id}>
              <button className="image-thumb" type="button" onClick={() => onOpenImage(image)}>
                <img src={mediaUrl(image.thumbnailUrl)} alt="" loading="lazy" />
              </button>
              <div className="image-menu-wrap">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Действия с изображением"
                  onClick={() => onToggleImageMenu(image.id)}
                >
                  ...
                </button>
                {openImageMenuId === image.id ? (
                  <div className="image-menu">
                    <button type="button" onClick={() => onDeleteImage(image)} disabled={isSaving}>
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {images.length > 4 ? (
        <button className="link-button expand-button" type="button" onClick={onToggleGallery}>
          {isGalleryExpanded ? "Свернуть" : "Показать все"}
        </button>
      ) : null}
    </section>
  );
}
