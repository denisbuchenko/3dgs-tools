import type { ColmapMetrics, ColmapStep } from "../types.js";
import type { ColmapJob } from "./jobState.js";

const maxSeriesPoints = 120;

export function createColmapMetrics(): ColmapMetrics {
  return {
    imageCount: 0,
    featureImages: 0,
    featureKeypoints: 0,
    matchedPairs: 0,
    verifiedPairs: 0,
    databaseMatches: 0,
    databaseGeometries: 0,
    mapperImages: 0,
    mapperPoints: 0,
    series: [],
    warnings: [],
  };
}

export function setColmapImageCount(job: ColmapJob, imageCount: number) {
  job.metrics.imageCount = imageCount;
  setStepProgress(job, "features", 0, imageCount, imageCount > 0 ? "Ожидаю обработку изображений" : undefined);
  pushMetricPoint(job);
}

export function setStepProgress(
  job: ColmapJob,
  stepId: string,
  current: number,
  total: number,
  message?: string
) {
  const step = job.steps.find((item) => item.id === stepId);

  if (!step || total <= 0) {
    return;
  }

  step.progress = {
    current,
    total,
    percent: Math.round(Math.min(100, Math.max(0, (current / total) * 100))),
    message,
  };
}

export function completeStepProgress(job: ColmapJob, stepId: string) {
  const step = job.steps.find((item) => item.id === stepId);

  if (!step) {
    return;
  }

  step.progress = {
    current: step.progress?.total ?? 1,
    total: step.progress?.total ?? 1,
    percent: 100,
    message: "Готово",
  };
}

export function ingestColmapOutput(job: ColmapJob, stepId: string, chunk: string) {
  for (const line of chunk.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    ingestFeatureLine(job, stepId, line);
    ingestMatchingLine(job, stepId, line);
    ingestMappingLine(job, stepId, line);
  }
}

export function updateColmapDatabaseMetrics(
  job: ColmapJob,
  matches: number,
  geometries: number
) {
  if (matches < job.metrics.databaseMatches && geometries < job.metrics.databaseGeometries) {
    return;
  }

  job.metrics.databaseMatches = Math.max(job.metrics.databaseMatches, matches);
  job.metrics.databaseGeometries = Math.max(job.metrics.databaseGeometries, geometries);
  job.metrics.verifiedPairs = Math.max(job.metrics.verifiedPairs, geometries);

  const totalPairs = estimateMatchingPairs(job);

  if (totalPairs > 0) {
    setStepProgress(
      job,
      "matching",
      Math.min(job.metrics.verifiedPairs || job.metrics.databaseMatches, totalPairs),
      totalPairs,
      `${job.metrics.databaseGeometries} геометрий в базе`
    );
  }

  pushMetricPoint(job);
  updateQualityWarnings(job);
}

function ingestFeatureLine(job: ColmapJob, stepId: string, line: string) {
  if (stepId !== "features") {
    return;
  }

  const processed = line.match(/Processed file\s+\[(\d+)\/(\d+)]/i);

  if (processed) {
    const current = Number(processed[1]);
    const total = Number(processed[2]);

    job.metrics.featureImages = Math.max(job.metrics.featureImages, current);
    job.metrics.imageCount = Math.max(job.metrics.imageCount, total);
    setStepProgress(job, "features", current, total, `${current} из ${total} изображений`);
  }

  const features = line.match(/(?:Features|Keypoints)\s*:\s*([\d,]+)/i);

  if (features) {
    job.metrics.featureKeypoints += parseInteger(features[1]);
    pushMetricPoint(job);
  }
}

function ingestMatchingLine(job: ColmapJob, stepId: string, line: string) {
  if (stepId !== "matching") {
    return;
  }

  const block = line.match(/Matching block\s+\[(\d+)\/(\d+)(?:,\s*(\d+)\/(\d+))?]/i);

  if (block) {
    const first = Number(block[1]);
    const firstTotal = Number(block[2]);
    const second = Number(block[3] ?? block[1]);
    const secondTotal = Number(block[4] ?? block[2]);
    const total = Math.max(1, firstTotal * secondTotal);
    const current = Math.min(total, Math.max(0, (first - 1) * secondTotal + second));

    job.metrics.matchedPairs = Math.max(job.metrics.matchedPairs, current);
    setStepProgress(job, "matching", current, total, `${current} из ${total} блоков`);
    pushMetricPoint(job);
    return;
  }

  const pairs = line.match(/(?:Matching|Verifying).*?(\d+)\s+(?:image\s+)?pairs?/i);

  if (pairs) {
    const value = parseInteger(pairs[1]);
    job.metrics.matchedPairs = Math.max(job.metrics.matchedPairs, value);
    pushMetricPoint(job);
  }
}

function ingestMappingLine(job: ColmapJob, stepId: string, line: string) {
  if (stepId !== "mapping") {
    return;
  }

  const registeringImage = line.match(/Registering image\s+#?(\d+)/i);

  if (registeringImage) {
    job.metrics.mapperImages += 1;
    const total = Math.max(job.metrics.imageCount, job.metrics.mapperImages);
    setStepProgress(job, "mapping", job.metrics.mapperImages, total, `${job.metrics.mapperImages} камер`);
  }

  const points = line.match(/(?:points3D|points|triangulated)\D+([\d,]+)/i);

  if (points) {
    job.metrics.mapperPoints = Math.max(job.metrics.mapperPoints, parseInteger(points[1]));
    pushMetricPoint(job);
    updateQualityWarnings(job);
  }
}

function estimateMatchingPairs(job: ColmapJob) {
  const imageCount = job.metrics.imageCount;

  if (imageCount < 2) {
    return 0;
  }

  if (job.settings.matcher === "exhaustive") {
    return (imageCount * (imageCount - 1)) / 2;
  }

  return Math.max(0, imageCount * Math.min(job.settings.sequentialOverlap, imageCount - 1));
}

function updateQualityWarnings(job: ColmapJob) {
  const matchingStep = job.steps.find((step) => step.id === "matching");
  const mappingImageThreshold = Math.min(job.metrics.imageCount, 8);

  if (
    matchingStep?.status === "done" &&
    job.metrics.imageCount >= 8 &&
    job.metrics.databaseGeometries > 0 &&
    job.metrics.databaseGeometries < 4
  ) {
    addColmapWarning(job, "low-geometries", "Мало геометрически проверенных пар. Реконструкция может получиться нестабильной.");
  }

  if (
    job.metrics.imageCount >= 8 &&
    mappingImageThreshold > 0 &&
    job.metrics.mapperImages >= mappingImageThreshold &&
    job.metrics.mapperPoints < 50
  ) {
    addColmapWarning(job, "low-triangulation", "На старте mapping мало триангулированных точек. Проверьте overlap и качество кадров.");
  }
}

export function addColmapWarning(job: ColmapJob, id: string, message: string) {
  if (job.metrics.warnings.some((warning) => warning.id === id)) {
    return;
  }

  job.metrics.warnings.push({
    id,
    message,
    createdAt: new Date().toISOString(),
  });
}

function pushMetricPoint(job: ColmapJob) {
  const last = job.metrics.series.at(-1);
  const next = {
    timestamp: new Date().toISOString(),
    keypoints: job.metrics.featureKeypoints,
    matches: Math.max(job.metrics.matchedPairs, job.metrics.databaseMatches),
    geometries: job.metrics.databaseGeometries,
    points: job.metrics.mapperPoints,
  };

  if (
    last &&
    last.keypoints === next.keypoints &&
    last.matches === next.matches &&
    last.geometries === next.geometries &&
    last.points === next.points
  ) {
    return;
  }

  job.metrics.series.push(next);

  if (job.metrics.series.length > maxSeriesPoints) {
    job.metrics.series.splice(0, job.metrics.series.length - maxSeriesPoints);
  }
}

function parseInteger(value: string) {
  return Number(value.replace(/,/g, ""));
}
