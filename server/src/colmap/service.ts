import type { ColmapJobSnapshot, ColmapSettings, Project } from "../types.js";
import { appendColmapLog, colmapJobs, createColmapSteps, snapshotColmapJob, type ColmapJob } from "./jobState.js";
import { createColmapMetrics } from "./metrics.js";
import { runColmapPipeline } from "./pipeline.js";
import { defaultColmapSettings, normalizeColmapSettings } from "./settings.js";

export function startColmapJob(project: Project, input: Partial<ColmapSettings>) {
  const current = colmapJobs.get(project.id);

  if (current?.status === "running") {
    throw new Error("COLMAP уже запущен для этого проекта.");
  }

  const job: ColmapJob = {
    projectId: project.id,
    status: "running",
    settings: normalizeColmapSettings(input),
    steps: createColmapSteps(),
    logs: [],
    metrics: createColmapMetrics(),
    startedAt: new Date().toISOString(),
  };

  colmapJobs.set(project.id, job);
  appendColmapLog(job, "COLMAP job started.");

  runColmapPipeline(project, job)
    .then(() => {
      job.status = "done";
      job.finishedAt = new Date().toISOString();
      appendColmapLog(job, "COLMAP job finished.");
    })
    .catch((error: unknown) => {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "COLMAP job failed.";
      appendColmapLog(job, job.error);
    });

  return snapshotColmapJob(job);
}

export function getColmapJob(projectId: string): ColmapJobSnapshot {
  const job = colmapJobs.get(projectId);

  if (job) {
    return snapshotColmapJob(job);
  }

  return {
    projectId,
    status: "idle",
    settings: defaultColmapSettings,
    steps: createColmapSteps(),
    logs: [],
    metrics: createColmapMetrics(),
  };
}
