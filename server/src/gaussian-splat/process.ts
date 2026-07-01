import { spawn } from "node:child_process";
import type { GsplatSettings } from "../types.js";
import { createGsplatEnv } from "./environment.js";
import { appendGsplatLog, markGsplatStep, type GsplatJob } from "./jobState.js";
import { defaultGsplatSettings } from "./settings.js";

export function createSpawnError(error: NodeJS.ErrnoException, commandName: string) {
  if (error.code === "ENOENT") {
    return new Error(
      `Не найден trainer "${commandName}". Установите Nerfstudio или задайте GSPLAT_BIN/GSPLAT_ARGS для своего trainer.`
    );
  }

  return error;
}

export function runGsplatCommand(
  job: GsplatJob,
  stepId: string,
  commandName: string,
  args: string[],
  settings: GsplatSettings
) {
  return new Promise<void>((resolve, reject) => {
    appendGsplatLog(job, `$ ${commandName} ${args.join(" ")}`);
    markGsplatStep(job, stepId, "running");

    const child = spawn(commandName, args, {
      env: createGsplatEnv(settings),
    });
    let stderr = "";

    job.process = child;

    child.stdout.on("data", (chunk) => appendGsplatLog(job, String(chunk)));
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      appendGsplatLog(job, String(chunk));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      markGsplatStep(job, stepId, "failed");
      reject(createSpawnError(error, commandName));
    });
    child.on("close", (code) => {
      job.process = undefined;

      if (code === 0) {
        markGsplatStep(job, stepId, "done");
        resolve();
        return;
      }

      markGsplatStep(job, stepId, "failed");
      reject(new Error(stderr.trim() || `gsplat завершился с кодом ${code}.`));
    });
  });
}

export function runGsplatToolCommand(job: GsplatJob, stepId: string, commandName: string, args: string[]) {
  return runGsplatCommand(job, stepId, commandName, args, defaultGsplatSettings);
}
