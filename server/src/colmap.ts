import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getImagesFolder, getProjectFolder } from "./media.js";
import type {
  ColmapCameraPose,
  ColmapJobSnapshot,
  ColmapResult,
  ColmapSettings,
  ColmapStep,
  Project,
} from "./types.js";

type ColmapJob = ColmapJobSnapshot & {
  process?: ReturnType<typeof spawn>;
};

const jobs = new Map<string, ColmapJob>();
const maxLogLines = 5000;
const colmapBinary = process.env.COLMAP_BIN || "/usr/bin/colmap";

const defaultColmapSettings: ColmapSettings = {
  useGpu: false,
  gpuIndex: "-1",
  matcher: "sequential",
  cameraModel: "SIMPLE_RADIAL",
  singleCamera: true,
  maxImageSize: 3200,
  maxNumFeatures: 8192,
  guidedMatching: false,
  sequentialOverlap: 10,
  sequentialLoopDetection: false,
  mapperMinNumMatches: 15,
  mapperMultipleModels: true,
  mapperExtractColors: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeColmapSettings(input: Partial<ColmapSettings> = {}): ColmapSettings {
  return {
    useGpu: Boolean(input.useGpu),
    gpuIndex: typeof input.gpuIndex === "string" && input.gpuIndex.trim() ? input.gpuIndex.trim() : "-1",
    matcher: input.matcher === "exhaustive" ? "exhaustive" : "sequential",
    cameraModel:
      typeof input.cameraModel === "string" && input.cameraModel.trim()
        ? input.cameraModel.trim()
        : defaultColmapSettings.cameraModel,
    singleCamera: input.singleCamera ?? defaultColmapSettings.singleCamera,
    maxImageSize: Math.round(clamp(Number(input.maxImageSize) || 3200, 512, 10000)),
    maxNumFeatures: Math.round(clamp(Number(input.maxNumFeatures) || 8192, 512, 65536)),
    guidedMatching: Boolean(input.guidedMatching),
    sequentialOverlap: Math.round(clamp(Number(input.sequentialOverlap) || 10, 1, 100)),
    sequentialLoopDetection: Boolean(input.sequentialLoopDetection),
    mapperMinNumMatches: Math.round(clamp(Number(input.mapperMinNumMatches) || 15, 4, 100)),
    mapperMultipleModels: input.mapperMultipleModels ?? defaultColmapSettings.mapperMultipleModels,
    mapperExtractColors: input.mapperExtractColors ?? defaultColmapSettings.mapperExtractColors,
  };
}

export function getDefaultColmapSettings() {
  return defaultColmapSettings;
}

function createSteps(): ColmapStep[] {
  return [
    { id: "prepare", label: "Подготовка рабочей папки", status: "pending" },
    { id: "features", label: "Извлечение признаков", status: "pending" },
    { id: "matching", label: "Матчинг изображений", status: "pending" },
    { id: "mapping", label: "Построение sparse model", status: "pending" },
    { id: "export_txt", label: "Экспорт камер и точек", status: "pending" },
    { id: "export_ply", label: "Экспорт PLY облака", status: "pending" },
  ];
}

function snapshot(job: ColmapJob): ColmapJobSnapshot {
  const { process: _process, ...rest } = job;
  return {
    ...rest,
    logs: [...rest.logs],
    steps: rest.steps.map((step) => ({ ...step })),
  };
}

function appendLog(job: ColmapJob, line: string) {
  const lines = line.split(/\r?\n/).filter(Boolean);

  for (const item of lines) {
    job.logs.push(`[${new Date().toISOString()}] ${item}`);
  }

  if (job.logs.length > maxLogLines) {
    job.logs.splice(0, job.logs.length - maxLogLines);
  }
}

function markStep(job: ColmapJob, stepId: string, status: ColmapStep["status"]) {
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

function createColmapEnv() {
  const blockedKeys = new Set([
    "LD_LIBRARY_PATH",
    "QT_PLUGIN_PATH",
    "QML2_IMPORT_PATH",
    "GIO_MODULE_DIR",
    "GSETTINGS_SCHEMA_DIR",
    "GTK_PATH",
    "LOCPATH",
  ]);
  const cleanEnv: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (
      blockedKeys.has(key) ||
      key.startsWith("SNAP") ||
      key.includes("_SNAP_") ||
      key.endsWith("_SNAP_ORIG")
    ) {
      continue;
    }

    cleanEnv[key] = value;
  }

  cleanEnv.PATH = process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
  cleanEnv.OMP_NUM_THREADS = process.env.COLMAP_THREADS ?? process.env.OMP_NUM_THREADS ?? "4";
  cleanEnv.QT_QPA_PLATFORM = "offscreen";
  cleanEnv.QT_ACCESSIBILITY = "0";

  return cleanEnv;
}

function createColmapError(code: number | null, stderr: string) {
  if (stderr.includes("/snap/core20") || stderr.includes("GLIBC_PRIVATE")) {
    return new Error(
      "COLMAP запустился с несовместимыми snap-библиотеками. Сервер теперь запускает COLMAP в очищенном окружении; перезапустите dev-сервер и попробуйте снова. Если ошибка останется, укажите системный бинарь через COLMAP_BIN=/usr/bin/colmap."
    );
  }

  return new Error(`COLMAP завершился с кодом ${code}.`);
}

function command(job: ColmapJob, stepId: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    appendLog(job, `$ ${colmapBinary} ${args.join(" ")}`);
    markStep(job, stepId, "running");

    const child = spawn(colmapBinary, args, {
      env: createColmapEnv(),
    });
    let stderr = "";

    job.process = child;

    child.stdout.on("data", (chunk) => appendLog(job, String(chunk)));
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      appendLog(job, String(chunk));
    });
    child.on("error", (error) => {
      markStep(job, stepId, "failed");
      reject(error);
    });
    child.on("close", (code) => {
      job.process = undefined;

      if (code === 0) {
        markStep(job, stepId, "done");
        resolve();
        return;
      }

      markStep(job, stepId, "failed");
      reject(createColmapError(code, stderr));
    });
  });
}

async function assertHasImages(project: Project) {
  const imagesPath = getImagesFolder(project);
  const imageStat = await stat(imagesPath);

  if (!imageStat.isDirectory()) {
    throw new Error("Папка изображений не найдена.");
  }
}

async function runPipeline(project: Project, job: ColmapJob) {
  const settings = job.settings;
  const projectFolder = getProjectFolder(project);
  const imagePath = getImagesFolder(project);
  const workspace = path.join(projectFolder, "colmap");
  const databasePath = path.join(workspace, "database.db");
  const sparsePath = path.join(workspace, "sparse");
  const modelPath = path.join(sparsePath, "0");
  const textPath = path.join(workspace, "txt");
  const plyPath = path.join(workspace, "points.ply");

  job.output = {
    workspace,
    sparse: sparsePath,
    text: textPath,
    ply: plyPath,
  };

  markStep(job, "prepare", "running");
  await assertHasImages(project);
  await rm(workspace, { force: true, recursive: true });
  await mkdir(sparsePath, { recursive: true });
  await mkdir(textPath, { recursive: true });
  markStep(job, "prepare", "done");

  const gpuValue = settings.useGpu ? "1" : "0";
  const featureArgs = [
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
  ];

  await command(job, "features", featureArgs);

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

  await command(job, "matching", matcherArgs);

  await command(job, "mapping", [
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
  ]);

  await command(job, "export_txt", [
    "model_converter",
    "--input_path",
    modelPath,
    "--output_path",
    textPath,
    "--output_type",
    "TXT",
  ]);

  await command(job, "export_ply", [
    "model_converter",
    "--input_path",
    modelPath,
    "--output_path",
    plyPath,
    "--output_type",
    "PLY",
  ]);
}

export function startColmapJob(project: Project, input: Partial<ColmapSettings>) {
  const current = jobs.get(project.id);

  if (current?.status === "running") {
    throw new Error("COLMAP уже запущен для этого проекта.");
  }

  const job: ColmapJob = {
    projectId: project.id,
    status: "running",
    settings: normalizeColmapSettings(input),
    steps: createSteps(),
    logs: [],
    startedAt: new Date().toISOString(),
  };

  jobs.set(project.id, job);
  appendLog(job, "COLMAP job started.");

  runPipeline(project, job)
    .then(() => {
      job.status = "done";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "COLMAP job finished.");
    })
    .catch((error: unknown) => {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "COLMAP job failed.";
      appendLog(job, job.error);
    });

  return snapshot(job);
}

export function getColmapJob(projectId: string): ColmapJobSnapshot {
  const job = jobs.get(projectId);

  if (job) {
    return snapshot(job);
  }

  return {
    projectId,
    status: "idle",
    settings: defaultColmapSettings,
    steps: createSteps(),
    logs: [],
  };
}

function cameraCenterFromWorldToCamera(
  qw: number,
  qx: number,
  qy: number,
  qz: number,
  tx: number,
  ty: number,
  tz: number
): [number, number, number] {
  const r00 = 1 - 2 * qy * qy - 2 * qz * qz;
  const r01 = 2 * qx * qy - 2 * qz * qw;
  const r02 = 2 * qx * qz + 2 * qy * qw;
  const r10 = 2 * qx * qy + 2 * qz * qw;
  const r11 = 1 - 2 * qx * qx - 2 * qz * qz;
  const r12 = 2 * qy * qz - 2 * qx * qw;
  const r20 = 2 * qx * qz - 2 * qy * qw;
  const r21 = 2 * qy * qz + 2 * qx * qw;
  const r22 = 1 - 2 * qx * qx - 2 * qy * qy;

  return [
    -(r00 * tx + r10 * ty + r20 * tz),
    -(r01 * tx + r11 * ty + r21 * tz),
    -(r02 * tx + r12 * ty + r22 * tz),
  ];
}

async function readCameraPoses(project: Project): Promise<ColmapCameraPose[]> {
  const imagesPath = path.join(getProjectFolder(project), "colmap", "txt", "images.txt");

  try {
    const content = await readFile(imagesPath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    const cameras: ColmapCameraPose[] = [];

    for (let index = 0; index < lines.length; index += 2) {
      const parts = lines[index]?.split(/\s+/) ?? [];

      if (parts.length < 10) {
        continue;
      }

      const id = Number(parts[0]);
      const qw = Number(parts[1]);
      const qx = Number(parts[2]);
      const qy = Number(parts[3]);
      const qz = Number(parts[4]);
      const tx = Number(parts[5]);
      const ty = Number(parts[6]);
      const tz = Number(parts[7]);
      const cameraId = Number(parts[8]);
      const name = parts.slice(9).join(" ");

      if ([id, qw, qx, qy, qz, tx, ty, tz, cameraId].some((value) => !Number.isFinite(value))) {
        continue;
      }

      cameras.push({
        id,
        name,
        cameraId,
        position: cameraCenterFromWorldToCamera(qw, qx, qy, qz, tx, ty, tz),
        rotation: [-qx, -qy, -qz, qw],
      });
    }

    return cameras;
  } catch {
    return [];
  }
}

export async function getColmapResult(project: Project): Promise<ColmapResult> {
  const plyPath = path.join(getProjectFolder(project), "colmap", "points.ply");

  try {
    const plyStat = await stat(plyPath);
    const plyVersion = `${Math.round(plyStat.mtimeMs)}-${plyStat.size}`;

    return {
      hasResult: true,
      plyUrl: `/api/projects/${encodeURIComponent(project.id)}/colmap/points.ply?v=${plyVersion}`,
      cameras: await readCameraPoses(project),
    };
  } catch {
    return {
      hasResult: false,
      plyUrl: null,
      cameras: [],
    };
  }
}

export async function resolveColmapPly(project: Project) {
  const plyPath = path.join(getProjectFolder(project), "colmap", "points.ply");
  const plyStat = await stat(plyPath);

  return {
    path: plyPath,
    size: plyStat.size,
  };
}
