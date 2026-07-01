import type { ChangeEvent, FormEvent, RefObject } from "react";
import type { VideoMetadata, VideoSettings } from "../types";

type VideoUploadModalProps = {
  error: string;
  isSaving: boolean;
  videoFile: File | null;
  videoInputRef: RefObject<HTMLInputElement>;
  videoMetadata: VideoMetadata | null;
  videoSettings: VideoSettings;
  onClose: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateSetting: (name: keyof VideoSettings, value: string) => void;
};

export function VideoUploadModal({
  error,
  isSaving,
  videoFile,
  videoInputRef,
  videoMetadata,
  videoSettings,
  onClose,
  onFileChange,
  onSubmit,
  onUpdateSetting,
}: VideoUploadModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal video-modal" onSubmit={onSubmit} aria-label="Загрузка видео">
        <header className="modal-header">
          <h2>Добавить видео</h2>
        </header>

        <label className="field">
          <span>Видео</span>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*,.mov,video/quicktime"
            onChange={onFileChange}
            required
          />
        </label>

        {videoMetadata ? (
          <div className="video-meta">
            <span>Длительность: {videoMetadata.duration.toFixed(2)} сек</span>
            <span>
              Разрешение: {videoMetadata.width} x {videoMetadata.height}
            </span>
          </div>
        ) : (
          <p className="side-note">
            Если браузер не прочитал метаданные MOV, сервер обработает видео через ffmpeg.
          </p>
        )}

        <div className="settings-grid">
          <VideoNumberField
            label="FPS"
            max="30"
            min="1"
            step="1"
            value={videoSettings.fps}
            disabled={!videoFile}
            onChange={(value) => onUpdateSetting("fps", value)}
            required
          />
          <VideoNumberField
            label="Уменьшить на, %"
            max="99"
            min="0"
            step="1"
            value={videoSettings.reductionPercent}
            disabled={!videoFile}
            onChange={(value) => onUpdateSetting("reductionPercent", value)}
            required
          />
          <VideoNumberField
            label="Начать с, сек"
            max={videoMetadata?.duration}
            min="0"
            step="0.01"
            value={videoSettings.startSecond}
            disabled={!videoFile}
            onChange={(value) => onUpdateSetting("startSecond", value)}
            required
          />
          <VideoNumberField
            label="Закончить на, сек"
            max={videoMetadata?.duration}
            min="0"
            step="0.01"
            value={videoSettings.endSecond}
            disabled={!videoFile}
            onChange={(value) => onUpdateSetting("endSecond", value)}
          />
        </div>

        {isSaving ? (
          <div className="loader-row">
            <span className="loader" aria-hidden="true" />
            <span>Видео загружается и обрабатывается...</span>
          </div>
        ) : null}

        {error ? <p className="error-message">{error}</p> : null}

        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose} disabled={isSaving}>
            Отмена
          </button>
          <button className="primary" type="submit" disabled={isSaving || !videoFile}>
            Загрузить
          </button>
        </div>
      </form>
    </div>
  );
}

type VideoNumberFieldProps = {
  label: string;
  value: string;
  disabled: boolean;
  min: string;
  max?: string | number;
  step: string;
  required?: boolean;
  onChange: (value: string) => void;
};

function VideoNumberField({
  label,
  value,
  disabled,
  min,
  max,
  step,
  required,
  onChange,
}: VideoNumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
      />
    </label>
  );
}
