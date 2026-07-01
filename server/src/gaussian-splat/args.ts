import path from "node:path";
import { getImagesFolder, getProjectFolder } from "../content/index.js";
import type { GsplatSettings, Project } from "../types.js";
import { defaultGsplatSettings, clamp } from "./settings.js";
import { replacePlaceholders, splitArgs } from "./strings.js";

export function createCustomGsplatArgs(
  project: Project,
  settings: GsplatSettings,
  workspace: string,
  plyPath: string
) {
  const projectFolder = getProjectFolder(project);
  const colmapWorkspace = path.join(projectFolder, "colmap");
  const sparsePath = path.join(colmapWorkspace, "sparse", "0");
  const replacements = {
    background: settings.background,
    colmapWorkspace,
    dataPath: projectFolder,
    densificationInterval: String(settings.densificationInterval),
    downscaleFactor: String(settings.downscaleFactor),
    gpuIndex: settings.useGpu ? settings.gpuIndex : "-1",
    imagePath: getImagesFolder(project),
    maxSteps: String(settings.maxSteps),
    opacityRegularization: String(settings.opacityRegularization),
    plyPath,
    quality: settings.quality,
    resolution: String(settings.resolution),
    shDegree: String(settings.shDegree),
    sparsePath,
    workspace,
  };
  const template =
    process.env.GSPLAT_ARGS ||
    "train --data {dataPath} --colmap-dir {sparsePath} --image-dir {imagePath} --output-dir {workspace} --output-ply {plyPath} --max-steps {maxSteps} --resolution {resolution} --sh-degree {shDegree} --downscale-factor {downscaleFactor} --background {background} --quality {quality} --gpu {gpuIndex} --densification-interval {densificationInterval} --opacity-reg {opacityRegularization}";

  return splitArgs(replacePlaceholders(template, replacements));
}

function createNerfstudioProfile(settings: GsplatSettings) {
  return {
    maxSteps: settings.quality === "draft" ? Math.min(settings.maxSteps, 5000) : settings.maxSteps,
    method: "splatfacto",
    numDownscales: settings.downscaleFactor,
    shDegree: settings.quality === "draft" ? Math.min(settings.shDegree, 2) : settings.shDegree,
  };
}

export function createNerfstudioTrainArgs(project: Project, settings: GsplatSettings, workspace: string) {
  const profile = createNerfstudioProfile(settings);
  const replacements = {
    background: settings.background,
    dataPath: path.join(workspace, "dataset"),
    maxSteps: String(profile.maxSteps),
    method: profile.method,
    outputDir: path.join(workspace, "outputs"),
    quality: settings.quality,
    shDegree: String(profile.shDegree),
  };
  const template =
    process.env.NERFSTUDIO_TRAIN_ARGS ||
    "{method} --output-dir {outputDir} --max-num-iterations {maxSteps} --vis tensorboard --steps-per-save 2000 --steps-per-eval-all-images 1000 --machine.seed 42 --pipeline.datamanager.cache-images-type uint8 --pipeline.model.sh-degree {shDegree} nerfstudio-data --data {dataPath}";
  const args = splitArgs(replacePlaceholders(template, replacements));

  if (!process.env.NERFSTUDIO_TRAIN_ARGS && settings.background !== "random") {
    args.splice(args.indexOf("nerfstudio-data"), 0, "--pipeline.model.background-color", settings.background);
  }

  if (!process.env.NERFSTUDIO_TRAIN_ARGS && settings.resolution < defaultGsplatSettings.resolution) {
    const cameraScale = Number(clamp(settings.resolution / defaultGsplatSettings.resolution, 0.25, 1).toFixed(2));
    args.splice(
      args.indexOf("nerfstudio-data"),
      0,
      "--pipeline.datamanager.camera-res-scale-factor",
      String(cameraScale)
    );
  }

  if (
    !process.env.NERFSTUDIO_TRAIN_ARGS &&
    settings.densificationInterval !== defaultGsplatSettings.densificationInterval
  ) {
    args.splice(
      args.indexOf("nerfstudio-data"),
      0,
      "--pipeline.model.refine-every",
      String(settings.densificationInterval)
    );
  }

  return args;
}

export function createNerfstudioProcessDataArgs(project: Project, settings: GsplatSettings, datasetPath: string) {
  return [
    "images",
    "--data",
    getImagesFolder(project),
    "--output-dir",
    datasetPath,
    "--skip-colmap",
    "--num-downscales",
    String(createNerfstudioProfile(settings).numDownscales),
  ];
}

export function createNerfstudioExportArgs(configPath: string, exportPath: string) {
  const replacements = {
    configPath,
    exportPath,
  };
  const template =
    process.env.NERFSTUDIO_EXPORT_ARGS ||
    "gaussian-splat --load-config {configPath} --output-dir {exportPath} --output-filename splats.ply --ply-color-mode sh_coeffs";

  return splitArgs(replacePlaceholders(template, replacements));
}
