import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getProjectFolder } from "../content/index.js";
import type { Project } from "../types.js";
import {
  createCustomGsplatArgs,
  createNerfstudioExportArgs,
  createNerfstudioProcessDataArgs,
  createNerfstudioTrainArgs,
} from "./args.js";
import { assertNerfstudioCanTrain, bootstrapNerfstudio, ensureGsplatEnvironment } from "./bootstrap.js";
import { getTorchExtensionsDir } from "./config.js";
import {
  assertHasColmap,
  copyColmapModelForNerfstudio,
  findFirstFile,
  findFirstPly,
} from "./filesystem.js";
import { markGsplatStep, type GsplatJob } from "./jobState.js";
import { runGsplatCommand } from "./process.js";
import type { ResolvedTrainer } from "./trainerTypes.js";

export async function runGsplatPipeline(project: Project, job: GsplatJob) {
  const settings = job.settings;
  const workspace = path.join(getProjectFolder(project), "gsplat");
  const datasetPath = path.join(workspace, "dataset");
  const plyPath = path.join(workspace, "splats.ply");
  let trainer: ResolvedTrainer;

  job.output = {
    workspace,
    ply: plyPath,
  };

  markGsplatStep(job, "prepare", "running");
  await assertHasColmap(project);
  await rm(workspace, { force: true, recursive: true });
  await mkdir(workspace, { recursive: true });
  await mkdir(getTorchExtensionsDir(), { recursive: true });
  markGsplatStep(job, "prepare", "done");

  try {
    trainer = await ensureGsplatEnvironment();
    markGsplatStep(job, "bootstrap", "done");
  } catch {
    trainer = await bootstrapNerfstudio(job);
  }

  if (trainer.backend === "custom") {
    await runGsplatCommand(
      job,
      "train",
      trainer.command,
      createCustomGsplatArgs(project, settings, workspace, plyPath),
      settings
    );
    await assertCustomTrainerOutput(job, plyPath);
    return;
  }

  const exportPath = path.join(workspace, "export");

  await copyColmapModelForNerfstudio(project, datasetPath);
  await runGsplatCommand(
    job,
    "dataset",
    trainer.nsProcessData,
    createNerfstudioProcessDataArgs(project, settings, datasetPath),
    settings
  );

  try {
    await assertNerfstudioCanTrain(trainer, settings);
  } catch (error) {
    markGsplatStep(job, "train", "failed");
    throw error;
  }

  await runGsplatCommand(
    job,
    "train",
    trainer.nsTrain,
    createNerfstudioTrainArgs(project, settings, workspace),
    settings
  );

  const configPath = await findFirstFile(path.join(workspace, "outputs"), "config.yml");

  if (!configPath) {
    throw new Error("Nerfstudio завершился, но config.yml не найден.");
  }

  await mkdir(exportPath, { recursive: true });
  await runGsplatCommand(
    job,
    "export_ply",
    trainer.nsExport,
    createNerfstudioExportArgs(configPath, exportPath),
    settings
  );

  const exportedPly = await findFirstPly(exportPath);

  if (!exportedPly) {
    throw new Error("Nerfstudio export завершился, но .ply файл не найден.");
  }

  await copyFile(exportedPly, plyPath);
}

async function assertCustomTrainerOutput(job: GsplatJob, plyPath: string) {
  markGsplatStep(job, "export_ply", "running");
  await stat(plyPath);
  markGsplatStep(job, "export_ply", "done");
}
