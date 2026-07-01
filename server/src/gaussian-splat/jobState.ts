import { spawn } from "node:child_process";
import type { GsplatJobSnapshot, GsplatStep } from "../types.js";

export type GsplatJob = GsplatJobSnapshot & {
  process?: ReturnType<typeof spawn>;
};

export const gsplatJobs = new Map<string, GsplatJob>();

const maxLogLines = 5000;

export function createGsplatSteps(): GsplatStep[] {
  return [
    { id: "prepare", label: "Проверка COLMAP данных", status: "pending" },
    { id: "bootstrap", label: "Подготовка gsplat trainer", status: "pending" },
    { id: "dataset", label: "Подготовка Nerfstudio dataset", status: "pending" },
    { id: "train", label: "Обучение Gaussian Splatting", status: "pending" },
    { id: "export_ply", label: "Экспорт PLY", status: "pending" },
  ];
}

export function snapshotGsplatJob(job: GsplatJob): GsplatJobSnapshot {
  const { process: _process, ...rest } = job;

  return {
    ...rest,
    logs: [...rest.logs],
    steps: rest.steps.map((step) => ({ ...step })),
  };
}

export function appendGsplatLog(job: GsplatJob, line: string) {
  const lines = line.split(/\r?\n/).filter(Boolean);

  for (const item of lines) {
    job.logs.push(`[${new Date().toISOString()}] ${item}`);
  }

  if (job.logs.length > maxLogLines) {
    job.logs.splice(0, job.logs.length - maxLogLines);
  }
}

export function markGsplatStep(job: GsplatJob, stepId: string, status: GsplatStep["status"]) {
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
