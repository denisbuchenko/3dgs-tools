import type { ColmapLivePreview, ColmapMetrics } from "../types";

type ColmapDashboardProps = {
  metrics: ColmapMetrics;
  preview?: ColmapLivePreview;
};

export function ColmapDashboard({ metrics, preview }: ColmapDashboardProps) {
  const hasActivity =
    metrics.imageCount > 0 ||
    metrics.featureKeypoints > 0 ||
    metrics.databaseMatches > 0 ||
    metrics.mapperPoints > 0;

  if (!hasActivity) {
    return null;
  }

  return (
    <div className="colmap-dashboard" aria-label="COLMAP metrics">
      {metrics.warnings.length > 0 ? (
        <div className="colmap-warnings">
          {metrics.warnings.map((warning) => (
            <p key={warning.id}>{warning.message}</p>
          ))}
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricCard label="Изображения" value={`${metrics.featureImages}/${metrics.imageCount || "-"}`} />
        <MetricCard label="Ключевые точки" value={formatNumber(metrics.featureKeypoints)} />
        <MetricCard label="Matches" value={formatNumber(Math.max(metrics.matchedPairs, metrics.databaseMatches))} />
        <MetricCard label="Геометрии" value={formatNumber(metrics.databaseGeometries)} />
        <MetricCard label="Камеры" value={formatNumber(metrics.mapperImages)} />
        <MetricCard label="Точки" value={formatNumber(metrics.mapperPoints)} />
      </div>

      <div className="chart-grid">
        <MetricChart
          label="Ключевые точки"
          points={metrics.series.map((point) => point.keypoints)}
          tone="blue"
        />
        <MetricChart
          label="Matches / геометрии"
          points={metrics.series.map((point) => Math.max(point.matches, point.geometries))}
          tone="green"
        />
        <MetricChart
          label="Точки sparse"
          points={metrics.series.map((point) => point.points)}
          tone="orange"
        />
      </div>

      {preview && preview.points.length > 0 ? <SparsePreview preview={preview} /> : null}
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
};

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type MetricChartProps = {
  label: string;
  points: number[];
  tone: "blue" | "green" | "orange";
};

function MetricChart({ label, points, tone }: MetricChartProps) {
  const path = createSparklinePath(points);

  return (
    <div className="metric-chart">
      <div className="metric-chart-header">
        <span>{label}</span>
        <strong>{formatNumber(points.at(-1) ?? 0)}</strong>
      </div>
      <svg viewBox="0 0 240 72" role="img" aria-label={label}>
        <path className="chart-grid-line" d="M0 58 H240" />
        <path className={`chart-line ${tone}`} d={path} />
      </svg>
    </div>
  );
}

function createSparklinePath(points: number[]) {
  if (points.length === 0) {
    return "M0 58";
  }

  const max = Math.max(...points, 1);
  const width = 240;
  const height = 58;
  const step = points.length > 1 ? width / (points.length - 1) : width;

  return points
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * height + 7;

      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru").format(value);
}

function SparsePreview({ preview }: { preview: ColmapLivePreview }) {
  const bounds = getBounds(preview.points.map((point) => point.position));

  return (
    <div className="sparse-preview">
      <div className="metric-chart-header">
        <span>Live sparse preview</span>
        <strong>{formatNumber(preview.totalPoints)} точек</strong>
      </div>
      <svg viewBox="0 0 320 160" role="img" aria-label="Live sparse preview">
        {preview.points.map((point, index) => {
          const x = scale(point.position[0], bounds.minX, bounds.maxX, 12, 308);
          const y = scale(point.position[2], bounds.minZ, bounds.maxZ, 148, 12);
          const [r, g, b] = point.color;

          return <circle key={index} cx={x} cy={y} r="1.8" fill={`rgb(${r}, ${g}, ${b})`} />;
        })}
      </svg>
    </div>
  );
}

function getBounds(points: [number, number, number][]) {
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[2]);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function scale(value: number, min: number, max: number, outMin: number, outMax: number) {
  if (Math.abs(max - min) < 0.0001) {
    return (outMin + outMax) / 2;
  }

  return outMin + ((value - min) / (max - min)) * (outMax - outMin);
}
