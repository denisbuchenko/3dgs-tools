import type {
  GsplatBackground,
  GsplatJob,
  GsplatQuality,
  GsplatResult,
  GsplatSettings,
  GsplatTrainerStatus,
} from "../types";
import { PipelineSteps } from "./PipelineSteps";

type GsplatSectionProps = {
  canStartGsplat: boolean;
  gsplatJob: GsplatJob | null;
  gsplatLogsCount: number;
  gsplatPlyUrl: string | null;
  gsplatResult: GsplatResult | null;
  gsplatRuntimeElapsed: string | null;
  gsplatSettings: GsplatSettings;
  gsplatStatus: GsplatTrainerStatus | null;
  isGsplatLoading: boolean;
  onOpenLogs: () => void;
  onOpenResult: () => void;
  onStart: () => void;
  onUpdateSetting: <Key extends keyof GsplatSettings>(key: Key, value: GsplatSettings[Key]) => void;
};

export function GsplatSection({
  canStartGsplat,
  gsplatJob,
  gsplatLogsCount,
  gsplatPlyUrl,
  gsplatResult,
  gsplatRuntimeElapsed,
  gsplatSettings,
  gsplatStatus,
  isGsplatLoading,
  onOpenLogs,
  onOpenResult,
  onStart,
  onUpdateSetting,
}: GsplatSectionProps) {
  const isRunning = gsplatJob?.status === "running";

  return (
    <section className="colmap-section gsplat-section" aria-label="gsplat">
      <div className="section-header">
        <div>
          <p className="eyebrow">gsplat</p>
          <h2>Gaussian Splatting</h2>
        </div>
        <div className="image-actions">
          <button className="primary" type="button" onClick={onStart} disabled={!canStartGsplat || isGsplatLoading || isRunning}>
            Запустить gsplat
          </button>
          <button className="secondary" type="button" onClick={onOpenLogs} disabled={gsplatLogsCount === 0}>
            Показать логи
          </button>
          <button className="secondary" type="button" onClick={onOpenResult} disabled={!gsplatPlyUrl || !gsplatResult?.hasResult}>
            Посмотреть PLY
          </button>
        </div>
      </div>

      {gsplatStatus ? (
        <p className={gsplatStatus.available ? "folder-name" : "error-message"}>
          {gsplatStatus.message}
          {gsplatRuntimeElapsed ? ` Идёт ${gsplatRuntimeElapsed}.` : ""}
        </p>
      ) : (
        <p className="side-note">Подготовка Gaussian Splatting...</p>
      )}

      <div className="colmap-grid">
        <label className="field">
          <span>Качество</span>
          <select
            value={gsplatSettings.quality}
            onChange={(event) => onUpdateSetting("quality", event.target.value as GsplatQuality)}
            disabled={isRunning}
          >
            <option value="draft">Draft</option>
            <option value="balanced">Balanced</option>
            <option value="high">High</option>
          </select>
        </label>

        <label className="field">
          <span>Фон/цвет</span>
          <select
            value={gsplatSettings.background}
            onChange={(event) => onUpdateSetting("background", event.target.value as GsplatBackground)}
            disabled={isRunning}
          >
            <option value="random">Random</option>
            <option value="black">Black</option>
            <option value="white">White</option>
          </select>
        </label>

        <NumberSetting label="Шаги обучения" min="500" max="30000" step="500" value={gsplatSettings.maxSteps} disabled={isRunning} onChange={(value) => onUpdateSetting("maxSteps", value)} />
        <NumberSetting label="Разрешение" min="384" max="4096" step="128" value={gsplatSettings.resolution} disabled={isRunning} onChange={(value) => onUpdateSetting("resolution", value)} />
        <NumberSetting label="SH degree" min="0" max="4" step="1" value={gsplatSettings.shDegree} disabled={isRunning} onChange={(value) => onUpdateSetting("shDegree", value)} />
        <NumberSetting label="Downscale levels" min="0" max="4" step="1" value={gsplatSettings.downscaleFactor} disabled={isRunning} onChange={(value) => onUpdateSetting("downscaleFactor", value)} />
        <NumberSetting label="Densification interval" min="10" max="5000" step="10" value={gsplatSettings.densificationInterval} disabled={isRunning} onChange={(value) => onUpdateSetting("densificationInterval", value)} />
        <NumberSetting label="Opacity regularization" min="0" max="1" step="0.01" value={gsplatSettings.opacityRegularization} disabled={isRunning} onChange={(value) => onUpdateSetting("opacityRegularization", value)} />
      </div>

      {gsplatJob ? <PipelineSteps steps={gsplatJob.steps} /> : null}

      {isRunning ? (
        <div className="loader-row">
          <span className="loader" aria-hidden="true" />
          <span>gsplat обучается...</span>
        </div>
      ) : null}

      {gsplatJob?.status === "done" && gsplatJob.output ? <p className="folder-name">gsplat/splats.ply</p> : null}
      {gsplatJob?.status === "failed" && gsplatJob.error ? <p className="error-message">{gsplatJob.error}</p> : null}
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
