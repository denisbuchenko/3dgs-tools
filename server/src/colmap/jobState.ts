import { spawn } from "node:child_process";
import type { ColmapJobSnapshot, ColmapStep } from "../types.js";

export type ColmapJob = ColmapJobSnapshot & {
  process?: ReturnType<typeof spawn>;
};

export const colmapJobs = new Map<string, ColmapJob>();

const maxLogLines = 5000;

export function createColmapSteps(): ColmapStep[] {
  return [
    { id: "prepare", label: "Подготовка рабочей папки", status: "pending" },
    { id: "features", label: "Извлечение признаков", status: "pending" },
    { id: "matching", label: "Матчинг изображений", status: "pending" },
    { id: "mapping", label: "Построение sparse model", status: "pending" },
    { id: "export_txt", label: "Экспорт камер и точек", status: "pending" },
    { id: "export_ply", label: "Экспорт PLY облака", status: "pending" },
  ];
}

export function snapshotColmapJob(job: ColmapJob): ColmapJobSnapshot {
  const { process: _process, ...rest } = job;
  return {
    ...rest,
    logs: [...rest.logs],
    metrics: {
      ...rest.metrics,
      series: rest.metrics.series.map((point) => ({ ...point })),
      warnings: rest.metrics.warnings.map((warning) => ({ ...warning })),
    },
    preview: rest.preview
      ? {
          ...rest.preview,
          points: rest.preview.points.map((point) => ({
            position: [...point.position],
            color: [...point.color],
          })),
        }
      : undefined,
    livePly: rest.livePly
      ? {
          ...rest.livePly,
          cameras: rest.livePly.cameras.map((camera) => ({
            ...camera,
            position: [...camera.position],
            rotation: [...camera.rotation],
          })),
        }
      : undefined,
    steps: rest.steps.map((step) => ({
      ...step,
      progress: step.progress ? { ...step.progress } : undefined,
    })),
  };
}

export function appendColmapLog(job: ColmapJob, line: string) {
  const lines = line.split(/\r?\n/).filter(Boolean);

  for (const item of lines) {
    job.logs.push(`[${new Date().toISOString()}] ${item}`);
  }

  if (job.logs.length > maxLogLines) {
    job.logs.splice(0, job.logs.length - maxLogLines);
  }
}

export function markColmapStep(job: ColmapJob, stepId: string, status: ColmapStep["status"]) {
  const step = job.steps.find((item) => item.id === stepId);

  if (!step) {
    return;
  }

  step.status = status;

  if (status === "running") {
    step.startedAt = new Date().toISOString();
  }

  if (status === "done" || status === "failed") {
    step.finishedAt = new Date().toISOString();
  }
}
