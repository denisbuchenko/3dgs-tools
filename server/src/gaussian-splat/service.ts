import type { GsplatJobSnapshot, GsplatSettings, Project } from "../types.js";
import { appendGsplatLog, createGsplatSteps, gsplatJobs, snapshotGsplatJob, type GsplatJob } from "./jobState.js";
import { runGsplatPipeline } from "./pipeline.js";
import { defaultGsplatSettings, normalizeGsplatSettings } from "./settings.js";

export function startGsplatJob(project: Project, input: Partial<GsplatSettings>) {
  const current = gsplatJobs.get(project.id);

  if (current?.status === "running") {
    throw new Error("gsplat уже запущен для этого проекта.");
  }

  const job: GsplatJob = {
    projectId: project.id,
    status: "running",
    settings: normalizeGsplatSettings(input),
    steps: createGsplatSteps(),
    logs: [],
    startedAt: new Date().toISOString(),
  };

  gsplatJobs.set(project.id, job);
  appendGsplatLog(job, "gsplat job started.");

  runGsplatPipeline(project, job)
    .then(() => {
      job.status = "done";
      job.finishedAt = new Date().toISOString();
      appendGsplatLog(job, "gsplat job finished.");
    })
    .catch((error: unknown) => {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "gsplat job failed.";
      appendGsplatLog(job, job.error);
    });

  return snapshotGsplatJob(job);
}

export function getGsplatJob(projectId: string): GsplatJobSnapshot {
  const job = gsplatJobs.get(projectId);

  if (job) {
    return snapshotGsplatJob(job);
  }

  return {
    projectId,
    status: "idle",
    settings: defaultGsplatSettings,
    steps: createGsplatSteps(),
    logs: [],
  };
}
