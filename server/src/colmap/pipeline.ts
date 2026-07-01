import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getImagesFolder, getProjectFolder } from "../content/index.js";
import type { Project } from "../types.js";
import { runColmapCommand } from "./command.js";
import { markColmapStep, type ColmapJob } from "./jobState.js";
import { setColmapImageCount, setStepProgress } from "./metrics.js";

const imageExtensions = new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".webp"]);

async function assertHasImages(project: Project) {
  const imagesPath = getImagesFolder(project);
  const imageStat = await stat(imagesPath);

  if (!imageStat.isDirectory()) {
    throw new Error("Папка изображений не найдена.");
  }
}

async function countProjectImages(project: Project) {
  const files = await readdir(getImagesFolder(project));

  return files.filter((file) => imageExtensions.has(path.extname(file).toLowerCase())).length;
}

export async function runColmapPipeline(project: Project, job: ColmapJob) {
  const settings = job.settings;
  const projectFolder = getProjectFolder(project);
  const imagePath = getImagesFolder(project);
  const workspace = path.join(projectFolder, "colmap");
  const databasePath = path.join(workspace, "database.db");
  const sparsePath = path.join(workspace, "sparse");
  const modelPath = path.join(sparsePath, "0");
  const snapshotPath = path.join(workspace, "live-snapshots");
  const textPath = path.join(workspace, "txt");
  const plyPath = path.join(workspace, "points.ply");

  job.output = {
    workspace,
    sparse: sparsePath,
    text: textPath,
    ply: plyPath,
  };

  markColmapStep(job, "prepare", "running");
  await assertHasImages(project);
  const imageCount = await countProjectImages(project);

  if (imageCount === 0) {
    throw new Error("В проекте нет изображений для COLMAP.");
  }

  setColmapImageCount(job, imageCount);
  await rm(workspace, { force: true, recursive: true });
  await mkdir(sparsePath, { recursive: true });
  await mkdir(snapshotPath, { recursive: true });
  await mkdir(textPath, { recursive: true });
  markColmapStep(job, "prepare", "done");

  const gpuValue = settings.useGpu ? "1" : "0";
  await runColmapCommand(job, "features", [
    "feature_extractor",
    "--database_path",
    databasePath,
    "--image_path",
    imagePath,
    "--ImageReader.camera_model",
    settings.cameraModel,
    "--ImageReader.single_camera",
    settings.singleCamera ? "1" : "0",
    "--SiftExtraction.use_gpu",
    gpuValue,
    "--SiftExtraction.gpu_index",
    settings.gpuIndex,
    "--SiftExtraction.max_image_size",
    String(settings.maxImageSize),
    "--SiftExtraction.max_num_features",
    String(settings.maxNumFeatures),
  ]);

  const matcherArgs =
    settings.matcher === "sequential"
      ? [
          "sequential_matcher",
          "--database_path",
          databasePath,
          "--SiftMatching.use_gpu",
          gpuValue,
          "--SiftMatching.gpu_index",
          settings.gpuIndex,
          "--SiftMatching.guided_matching",
          settings.guidedMatching ? "1" : "0",
          "--SequentialMatching.overlap",
          String(settings.sequentialOverlap),
          "--SequentialMatching.loop_detection",
          settings.sequentialLoopDetection ? "1" : "0",
        ]
      : [
          "exhaustive_matcher",
          "--database_path",
          databasePath,
          "--SiftMatching.use_gpu",
          gpuValue,
          "--SiftMatching.gpu_index",
          settings.gpuIndex,
          "--SiftMatching.guided_matching",
          settings.guidedMatching ? "1" : "0",
        ];

  const matchingTotal =
    settings.matcher === "exhaustive"
      ? (imageCount * (imageCount - 1)) / 2
      : Math.max(0, imageCount * Math.min(settings.sequentialOverlap, imageCount - 1));

  setStepProgress(job, "matching", 0, matchingTotal, "Ожидаю пары изображений");
  await runColmapCommand(job, "matching", matcherArgs, { databasePath });

  await runColmapCommand(
    job,
    "mapping",
    [
      "mapper",
      "--database_path",
      databasePath,
      "--image_path",
      imagePath,
      "--output_path",
      sparsePath,
      "--Mapper.min_num_matches",
      String(settings.mapperMinNumMatches),
      "--Mapper.multiple_models",
      settings.mapperMultipleModels ? "1" : "0",
      "--Mapper.extract_colors",
      settings.mapperExtractColors ? "1" : "0",
      "--Mapper.snapshot_path",
      snapshotPath,
      "--Mapper.snapshot_images_freq",
      String(Math.max(1, Number(process.env.COLMAP_LIVE_SNAPSHOT_IMAGES_FREQ || 1))),
    ],
    {
      livePly: {
        modelPaths: [modelPath, snapshotPath],
        projectId: project.id,
        workspace,
      },
      previewModelPath: modelPath,
    }
  );

  await runColmapCommand(job, "export_txt", [
    "model_converter",
    "--input_path",
    modelPath,
    "--output_path",
    textPath,
    "--output_type",
    "TXT",
  ]);

  await runColmapCommand(job, "export_ply", [
    "model_converter",
    "--input_path",
    modelPath,
    "--output_path",
    plyPath,
    "--output_type",
    "PLY",
  ]);
}
