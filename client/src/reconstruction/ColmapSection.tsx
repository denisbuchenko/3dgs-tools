import type { ColmapJob, ColmapMatcher, ColmapResult, ColmapSettings } from "../types";
import { PipelineSteps } from "./PipelineSteps";

type ColmapSectionProps = {
  colmapJob: ColmapJob | null;
  colmapLogsCount: number;
  colmapResult: ColmapResult | null;
  colmapSettings: ColmapSettings;
  isColmapLoading: boolean;
  resultPlyUrl: string | null;
  onOpenLogs: () => void;
  onOpenResult: () => void;
  onStart: () => void;
  onUpdateSetting: <Key extends keyof ColmapSettings>(key: Key, value: ColmapSettings[Key]) => void;
};

export function ColmapSection({
  colmapJob,
  colmapLogsCount,
  colmapResult,
  colmapSettings,
  isColmapLoading,
  resultPlyUrl,
  onOpenLogs,
  onOpenResult,
  onStart,
  onUpdateSetting,
}: ColmapSectionProps) {
  const isRunning = colmapJob?.status === "running";

  return (
    <section className="colmap-section" aria-label="COLMAP">
      <div className="section-header">
        <div>
          <p className="eyebrow">COLMAP</p>
          <h2>Реконструкция</h2>
        </div>
        <div className="image-actions">
          <button className="primary" type="button" onClick={onStart} disabled={isColmapLoading || isRunning}>
            Запустить COLMAP
          </button>
          <button className="secondary" type="button" onClick={onOpenLogs} disabled={colmapLogsCount === 0}>
            Показать логи
          </button>
          <button
            className="secondary"
            type="button"
            onClick={onOpenResult}
            disabled={!resultPlyUrl || !colmapResult?.hasResult}
          >
            Посмотреть результат
          </button>
        </div>
      </div>

      <div className="colmap-grid">
        <label className="check-field">
          <input
            type="checkbox"
            checked={colmapSettings.useGpu}
            onChange={(event) => onUpdateSetting("useGpu", event.target.checked)}
            disabled={isRunning}
          />
          <span>Использовать GPU</span>
        </label>

        <label className="field">
          <span>GPU index</span>
          <input
            value={colmapSettings.gpuIndex}
            onChange={(event) => onUpdateSetting("gpuIndex", event.target.value)}
            disabled={isRunning || !colmapSettings.useGpu}
          />
        </label>

        <label className="field">
          <span>Матчинг</span>
          <select
            value={colmapSettings.matcher}
            onChange={(event) => onUpdateSetting("matcher", event.target.value as ColmapMatcher)}
            disabled={isRunning}
          >
            <option value="sequential">Последовательный</option>
            <option value="exhaustive">Полный</option>
          </select>
        </label>

        <NumberSetting
          label="Перекрытие кадров"
          min="1"
          max="100"
          step="1"
          value={colmapSettings.sequentialOverlap}
          disabled={isRunning || colmapSettings.matcher !== "sequential"}
          onChange={(value) => onUpdateSetting("sequentialOverlap", value)}
        />

        <label className="field">
          <span>Модель камеры</span>
          <select
            value={colmapSettings.cameraModel}
            onChange={(event) => onUpdateSetting("cameraModel", event.target.value)}
            disabled={isRunning}
          >
            <option>SIMPLE_RADIAL</option>
            <option>PINHOLE</option>
            <option>SIMPLE_PINHOLE</option>
            <option>OPENCV</option>
            <option>RADIAL</option>
          </select>
        </label>

        <NumberSetting
          label="Макс. размер изображения"
          min="512"
          max="10000"
          step="128"
          value={colmapSettings.maxImageSize}
          disabled={isRunning}
          onChange={(value) => onUpdateSetting("maxImageSize", value)}
        />
        <NumberSetting
          label="Макс. признаков"
          min="512"
          max="65536"
          step="512"
          value={colmapSettings.maxNumFeatures}
          disabled={isRunning}
          onChange={(value) => onUpdateSetting("maxNumFeatures", value)}
        />
        <NumberSetting
          label="Мин. matches для mapper"
          min="4"
          max="100"
          step="1"
          value={colmapSettings.mapperMinNumMatches}
          disabled={isRunning}
          onChange={(value) => onUpdateSetting("mapperMinNumMatches", value)}
        />
      </div>

      <div className="colmap-toggles">
        <ToggleSetting
          label="Одна камера для всех изображений"
          checked={colmapSettings.singleCamera}
          disabled={isRunning}
          onChange={(value) => onUpdateSetting("singleCamera", value)}
        />
        <ToggleSetting
          label="Guided matching"
          checked={colmapSettings.guidedMatching}
          disabled={isRunning}
          onChange={(value) => onUpdateSetting("guidedMatching", value)}
        />
        <ToggleSetting
          label="Loop detection"
          checked={colmapSettings.sequentialLoopDetection}
          disabled={isRunning || colmapSettings.matcher !== "sequential"}
          onChange={(value) => onUpdateSetting("sequentialLoopDetection", value)}
        />
        <ToggleSetting
          label="Несколько моделей"
          checked={colmapSettings.mapperMultipleModels}
          disabled={isRunning}
          onChange={(value) => onUpdateSetting("mapperMultipleModels", value)}
        />
        <ToggleSetting
          label="Цвета точек"
          checked={colmapSettings.mapperExtractColors}
          disabled={isRunning}
          onChange={(value) => onUpdateSetting("mapperExtractColors", value)}
        />
      </div>

      {colmapJob ? <PipelineSteps steps={colmapJob.steps} /> : null}

      {isRunning ? (
        <div className="loader-row">
          <span className="loader" aria-hidden="true" />
          <span>COLMAP выполняется...</span>
        </div>
      ) : null}

      {colmapJob?.status === "done" && colmapJob.output ? <p className="folder-name">colmap/points.ply</p> : null}
      {colmapJob?.status === "failed" && colmapJob.error ? <p className="error-message">{colmapJob.error}</p> : null}
    </section>
  );
}

type NumberSettingProps = {
  label: string;
  value: number;
  disabled: boolean;
  min: string;
  max: string;
  step: string;
  onChange: (value: number) => void;
};

function NumberSetting({ label, value, disabled, min, max, step, onChange }: NumberSettingProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      />
    </label>
  );
}

type ToggleSettingProps = {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
};

function ToggleSetting({ label, checked, disabled, onChange }: ToggleSettingProps) {
  return (
    <label className="check-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}
