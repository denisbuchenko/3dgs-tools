import { useEffect, useState, type WheelEvent } from "react";

type CameraViewControlsProps = {
  active: boolean;
  cameraCount: number;
  imageAvailable: boolean;
  imageVisible: boolean;
  selectedCamera: number;
  onImageVisibleChange: (visible: boolean) => void;
  onSelectedCameraChange: (cameraNumber: number) => void;
  onToggleActive: () => void;
};

function clampCameraNumber(value: number, cameraCount: number) {
  if (cameraCount <= 0) {
    return 1;
  }

  return Math.min(cameraCount, Math.max(1, value));
}

export function CameraViewControls({
  active,
  cameraCount,
  imageAvailable,
  imageVisible,
  selectedCamera,
  onImageVisibleChange,
  onSelectedCameraChange,
  onToggleActive,
}: CameraViewControlsProps) {
  const [draftValue, setDraftValue] = useState(String(selectedCamera));
  const disabled = cameraCount === 0;

  useEffect(() => {
    setDraftValue(String(selectedCamera));
  }, [selectedCamera]);

  const commitValue = (value: string) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      setDraftValue(String(selectedCamera));
      return;
    }

    const nextCamera = clampCameraNumber(Math.trunc(parsed), cameraCount);
    setDraftValue(String(nextCamera));
    onSelectedCameraChange(nextCamera);
  };

  const handleWheel = (event: WheelEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY > 0 ? 1 : -1;
    onSelectedCameraChange(clampCameraNumber(selectedCamera + direction, cameraCount));
  };

  return (
    <div
      className="camera-view-controls"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        aria-pressed={active}
        className={active ? "camera-view-toggle is-active" : "camera-view-toggle"}
        disabled={disabled}
        type="button"
        onClick={onToggleActive}
      >
        Применить обзор
      </button>
      <button
        aria-pressed={imageVisible}
        className={imageVisible ? "camera-view-toggle is-active" : "camera-view-toggle"}
        disabled={disabled || !active || !imageAvailable}
        type="button"
        onClick={() => onImageVisibleChange(!imageVisible)}
      >
        Показать изображение
      </button>
      <label className="camera-view-number">
        <span>Камера</span>
        <input
          disabled={disabled}
          inputMode="numeric"
          max={Math.max(1, cameraCount)}
          min={1}
          step={1}
          type="number"
          value={draftValue}
          onBlur={() => commitValue(draftValue)}
          onChange={(event) => {
            const value = event.target.value;
            setDraftValue(value);

            if (value !== "") {
              commitValue(value);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitValue(draftValue);
              event.currentTarget.blur();
            }
          }}
          onWheel={handleWheel}
        />
        <span className="camera-view-count">/{Math.max(1, cameraCount)}</span>
      </label>
    </div>
  );
}
