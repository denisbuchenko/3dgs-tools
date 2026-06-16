import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getImagesFolder, getProjectFolder } from "./media.js";
import { serverRoot } from "./storage.js";
import type {
  GsplatJobSnapshot,
  GsplatResult,
  GsplatSettings,
  GsplatStep,
  GsplatTrainerStatus,
  Project,
} from "./types.js";

type GsplatJob = GsplatJobSnapshot & {
  process?: ReturnType<typeof spawn>;
};

const jobs = new Map<string, GsplatJob>();
const maxLogLines = 5000;
const customGsplatBinary = process.env.GSPLAT_BIN || null;
const toolsRoot = path.join(serverRoot, "tools");
const nerfstudioVenv = process.env.GSPLAT_VENV || path.join(toolsRoot, "nerfstudio");
const nerfstudioPackage = process.env.GSPLAT_BOOTSTRAP_PACKAGE || "nerfstudio";
let environmentState: "idle" | "installing" | "ready" | "failed" = "idle";
let environmentMessage = "Gaussian Splatting готовится.";
let environmentPromise: Promise<ResolvedTrainer> | null = null;
let environmentStartedAt: string | null = null;

const defaultGsplatSettings: GsplatSettings = {
  quality: "balanced",
  background: "black",
  useGpu: true,
  gpuIndex: "0",
  maxSteps: 10000,
  resolution: 960,
  shDegree: 2,
  downscaleFactor: 2,
  densificationInterval: 200,
  opacityRegularization: 0.0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeGsplatSettings(input: Partial<GsplatSettings> = {}): GsplatSettings {
  return {
    quality:
      input.quality === "draft" || input.quality === "high"
        ? input.quality
        : defaultGsplatSettings.quality,
    background:
      input.background === "white" || input.background === "random"
        ? input.background
        : defaultGsplatSettings.background,
    useGpu: input.useGpu ?? defaultGsplatSettings.useGpu,
    gpuIndex: typeof input.gpuIndex === "string" && input.gpuIndex.trim() ? input.gpuIndex.trim() : "0",
    maxSteps: Math.round(clamp(Number(input.maxSteps) || defaultGsplatSettings.maxSteps, 500, 30000)),
    resolution: Math.round(clamp(Number(input.resolution) || defaultGsplatSettings.resolution, 384, 1600)),
    shDegree: Math.round(clamp(Number(input.shDegree) || defaultGsplatSettings.shDegree, 0, 3)),
    downscaleFactor: Math.round(clamp(Number(input.downscaleFactor) || defaultGsplatSettings.downscaleFactor, 1, 16)),
    densificationInterval: Math.round(
      clamp(Number(input.densificationInterval) || defaultGsplatSettings.densificationInterval, 10, 5000)
    ),
    opacityRegularization: clamp(
      Number(input.opacityRegularization) || defaultGsplatSettings.opacityRegularization,
      0,
      1
    ),
  };
}

export function getDefaultGsplatSettings() {
  return defaultGsplatSettings;
}

function createSteps(): GsplatStep[] {
  return [
    { id: "prepare", label: "Проверка COLMAP данных", status: "pending" },
    { id: "bootstrap", label: "Подготовка gsplat trainer", status: "pending" },
    { id: "dataset", label: "Подготовка Nerfstudio dataset", status: "pending" },
    { id: "train", label: "Обучение Gaussian Splatting", status: "pending" },
    { id: "export_ply", label: "Экспорт PLY", status: "pending" },
  ];
}

function snapshot(job: GsplatJob): GsplatJobSnapshot {
  const { process: _process, ...rest } = job;

  return {
    ...rest,
    logs: [...rest.logs],
    steps: rest.steps.map((step) => ({ ...step })),
  };
}

function appendLog(job: GsplatJob, line: string) {
  const lines = line.split(/\r?\n/).filter(Boolean);

  for (const item of lines) {
    job.logs.push(`[${new Date().toISOString()}] ${item}`);
  }

  if (job.logs.length > maxLogLines) {
    job.logs.splice(0, job.logs.length - maxLogLines);
  }
}

function markStep(job: GsplatJob, stepId: string, status: GsplatStep["status"]) {
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

function splitArgs(value: string) {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    args.push(match[1] ?? match[2] ?? match[3]);
  }

  return args;
}

function replacePlaceholders(value: string, replacements: Record<string, string>) {
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => replacements[key] ?? "");
}

async function findExecutable(command: string) {
  if (command.includes(path.sep)) {
    try {
      await access(command);
      return command;
    } catch {
      return null;
    }
  }

  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    const executablePath = path.join(directory, command);

    try {
      await access(executablePath);
      return executablePath;
    } catch {
      // Continue searching PATH.
    }
  }

  return null;
}

type ResolvedTrainer =
  | {
      backend: "custom";
      command: string;
    }
  | {
      backend: "nerfstudio";
      nsProcessData: string;
      nsTrain: string;
      nsExport: string;
      python?: string;
    };

async function resolveTrainer(): Promise<ResolvedTrainer | null> {
  if (customGsplatBinary) {
    const command = await findExecutable(customGsplatBinary);

    return command ? { backend: "custom", command } : null;
  }

  const nsTrain = await findExecutable("ns-train");
  const nsExport = await findExecutable("ns-export");
  const nsProcessData = await findExecutable("ns-process-data");

  if (nsTrain && nsExport && nsProcessData) {
    return { backend: "nerfstudio", nsProcessData, nsTrain, nsExport };
  }

  const gsplat = await findExecutable("gsplat");

  return gsplat ? { backend: "custom", command: gsplat } : null;
}

async function findPythonForNerfstudio() {
  return (await findExecutable("python3.10")) ?? (await findExecutable("python3"));
}

function localNerfstudioCommands() {
  return {
    nsExport: path.join(nerfstudioVenv, "bin", "ns-export"),
    nsProcessData: path.join(nerfstudioVenv, "bin", "ns-process-data"),
    nsTrain: path.join(nerfstudioVenv, "bin", "ns-train"),
    pip: path.join(nerfstudioVenv, "bin", "pip"),
    python: path.join(nerfstudioVenv, "bin", "python"),
  };
}

async function resolveLocalNerfstudio(): Promise<ResolvedTrainer | null> {
  const commands = localNerfstudioCommands();

  try {
    await access(commands.nsProcessData);
    await access(commands.nsTrain);
    await access(commands.nsExport);
    return {
      backend: "nerfstudio",
      nsProcessData: commands.nsProcessData,
      nsTrain: commands.nsTrain,
      nsExport: commands.nsExport,
      python: commands.python,
    };
  } catch {
    return null;
  }
}

export async function getGsplatTrainerStatus(): Promise<GsplatTrainerStatus> {
  if (environmentState === "installing") {
    return {
      available: false,
      backend: "nerfstudio",
      command: null,
      message: environmentMessage,
      startedAt: environmentStartedAt,
    };
  }

  if (environmentState === "failed") {
    return {
      available: false,
      backend: null,
      command: null,
      message: environmentMessage,
      startedAt: environmentStartedAt,
    };
  }

  const trainer = await resolveTrainer();

  if (trainer?.backend === "nerfstudio") {
    if (environmentState !== "ready") {
      ensureGsplatEnvironment().catch(() => undefined);

      return {
        available: false,
        backend: "nerfstudio",
        command: null,
        message: "Backend готовит Gaussian Splatting runtime.",
        startedAt: environmentStartedAt,
      };
    }

    return {
      available: true,
      backend: "nerfstudio",
      command: null,
      message: "Gaussian Splatting готов к запуску.",
      startedAt: environmentStartedAt,
    };
  }

  if (trainer?.backend === "custom") {
    return {
      available: true,
      backend: "custom",
      command: null,
      message: "Gaussian Splatting готов к запуску.",
      startedAt: environmentStartedAt,
    };
  }

  const localTrainer = await resolveLocalNerfstudio();

  if (localTrainer?.backend === "nerfstudio") {
    if (environmentState !== "ready") {
      ensureGsplatEnvironment().catch(() => undefined);

      return {
        available: false,
        backend: "nerfstudio",
        command: null,
        message: "Backend готовит Gaussian Splatting runtime.",
        startedAt: environmentStartedAt,
      };
    }

    return {
      available: true,
      backend: "nerfstudio",
      command: null,
      message: "Gaussian Splatting готов к запуску.",
      startedAt: environmentStartedAt,
    };
  }

  const python = await findPythonForNerfstudio();

  if (python && environmentState === "idle") {
    ensureGsplatEnvironment().catch(() => undefined);
  }

  return {
    available: false,
    backend: python ? "nerfstudio" : null,
    command: null,
    message: python
      ? "Backend готовит Gaussian Splatting runtime."
      : "Не найден Python 3. Установите Python 3, чтобы backend смог подготовить Gaussian Splatting.",
    startedAt: environmentStartedAt,
  };
}

function createCustomGsplatArgs(project: Project, settings: GsplatSettings, workspace: string, plyPath: string) {
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
  const qualityScale = settings.quality === "draft" ? 0.35 : settings.quality === "high" ? 0.7 : 0.5;
  const requestedScale = clamp(settings.resolution / 1920, 0.25, 0.85);
  const cameraScale = Number(Math.min(qualityScale, requestedScale).toFixed(2));
  const maxSteps =
    settings.quality === "draft"
      ? Math.min(settings.maxSteps, 5000)
      : settings.quality === "high"
        ? Math.min(settings.maxSteps, 15000)
        : Math.min(settings.maxSteps, 10000);
  const stopSplitAt = Math.max(500, Math.min(maxSteps - 1, Math.round(maxSteps * 0.55)));
  const stopScreenSizeAt = Math.max(500, Math.min(stopSplitAt, Math.round(maxSteps * 0.35)));
  const shDegree =
    settings.quality === "draft"
      ? Math.min(settings.shDegree, 1)
      : settings.quality === "high"
        ? Math.min(settings.shDegree, 3)
        : Math.min(settings.shDegree, 2);
  const numDownscales = settings.quality === "draft" ? 3 : settings.quality === "high" ? 2 : 2;

  return {
    cameraScale,
    maxSteps,
    numDownscales,
    refineEvery: settings.quality === "draft" ? 250 : Math.max(100, settings.densificationInterval),
    shDegree,
    stopScreenSizeAt,
    stopSplitAt,
  };
}

function createNerfstudioTrainArgs(project: Project, settings: GsplatSettings, workspace: string) {
  const profile = createNerfstudioProfile(settings);
  const replacements = {
    background: settings.background,
    cameraScale: String(profile.cameraScale),
    dataPath: path.join(workspace, "dataset"),
    maxSteps: String(profile.maxSteps),
    numDownscales: String(profile.numDownscales),
    outputDir: path.join(workspace, "outputs"),
    quality: settings.quality,
    refineEvery: String(profile.refineEvery),
    resolution: String(settings.resolution),
    shDegree: String(profile.shDegree),
    stopScreenSizeAt: String(profile.stopScreenSizeAt),
    stopSplitAt: String(profile.stopSplitAt),
  };
  const model = "splatfacto";
  const template =
    process.env.NERFSTUDIO_TRAIN_ARGS ||
    `${model} --output-dir {outputDir} --max-num-iterations {maxSteps} --steps-per-eval-batch 0 --steps-per-eval-image 0 --steps-per-eval-all-images 0 --mixed-precision True --vis tensorboard --data {dataPath} --pipeline.datamanager.cache-images cpu --pipeline.datamanager.cache-images-type uint8 --pipeline.datamanager.camera-res-scale-factor {cameraScale} --pipeline.model.background-color {background} --pipeline.model.sh-degree {shDegree} --pipeline.model.num-downscales {numDownscales} --pipeline.model.refine-every {refineEvery} --pipeline.model.stop-split-at {stopSplitAt} --pipeline.model.stop-screen-size-at {stopScreenSizeAt} --pipeline.model.use-scale-regularization True --viewer.num-rays-per-chunk 4096`;

  return splitArgs(replacePlaceholders(template, replacements));
}

function downscaleFactorToLevels(downscaleFactor: number) {
  if (downscaleFactor <= 1) {
    return 0;
  }

  return Math.round(clamp(Math.log2(downscaleFactor), 0, 4));
}

function createNerfstudioProcessDataArgs(project: Project, settings: GsplatSettings, datasetPath: string) {
  return [
    "images",
    "--data",
    getImagesFolder(project),
    "--output-dir",
    datasetPath,
    "--skip-colmap",
    "--colmap-model-path",
    "colmap/sparse/0",
    "--num-downscales",
    String(downscaleFactorToLevels(settings.downscaleFactor)),
  ];
}

function createNerfstudioExportArgs(configPath: string, exportPath: string) {
  const replacements = {
    configPath,
    exportPath,
  };
  const template =
    process.env.NERFSTUDIO_EXPORT_ARGS ||
    "gaussian-splat --load-config {configPath} --output-dir {exportPath}";

  return splitArgs(replacePlaceholders(template, replacements));
}

function createGsplatEnv(settings: GsplatSettings) {
  const env = { ...process.env };
  env.MPLCONFIGDIR = env.MPLCONFIGDIR || path.join("/tmp", "3dgs-tools-matplotlib");
  env.TORCH_EXTENSIONS_DIR = env.TORCH_EXTENSIONS_DIR || getTorchExtensionsDir();
  env.MAX_JOBS = env.MAX_JOBS || "2";
  env.PYTORCH_CUDA_ALLOC_CONF = env.PYTORCH_CUDA_ALLOC_CONF || "expandable_segments:True";

  if (!env.TORCH_CUDA_ARCH_LIST) {
    const archResult = spawnSync("nvidia-smi", ["--query-gpu=compute_cap", "--format=csv,noheader"], {
      encoding: "utf8",
    });
    const archList = archResult.stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(";");

    env.TORCH_CUDA_ARCH_LIST = archList || "8.6";
  }

  if (!env.CC && existsSync("/usr/bin/gcc-12")) {
    env.CC = "/usr/bin/gcc-12";
  }

  if (!env.CXX && existsSync("/usr/bin/g++-12")) {
    env.CXX = "/usr/bin/g++-12";
  }

  if (!env.CUDAHOSTCXX && existsSync("/usr/bin/g++-12")) {
    env.CUDAHOSTCXX = "/usr/bin/g++-12";
  }

  if (!settings.useGpu) {
    env.CUDA_VISIBLE_DEVICES = "";
  } else if (settings.gpuIndex) {
    env.CUDA_VISIBLE_DEVICES = settings.gpuIndex;
  }

  return env;
}

function getTorchExtensionsDir() {
  return process.env.TORCH_EXTENSIONS_DIR || path.join(toolsRoot, "torch_extensions");
}

function createSpawnError(error: NodeJS.ErrnoException, commandName: string) {
  if (error.code === "ENOENT") {
    return new Error(
      `Не найден trainer "${commandName}". Установите Nerfstudio или задайте GSPLAT_BIN/GSPLAT_ARGS для своего trainer.`
    );
  }

  return error;
}

function command(job: GsplatJob, stepId: string, commandName: string, args: string[], settings: GsplatSettings) {
  return new Promise<void>((resolve, reject) => {
    appendLog(job, `$ ${commandName} ${args.join(" ")}`);
    markStep(job, stepId, "running");

    const child = spawn(commandName, args, {
      env: createGsplatEnv(settings),
    });
    let stderr = "";

    job.process = child;

    child.stdout.on("data", (chunk) => appendLog(job, String(chunk)));
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      appendLog(job, String(chunk));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      markStep(job, stepId, "failed");
      reject(createSpawnError(error, commandName));
    });
    child.on("close", (code) => {
      job.process = undefined;

      if (code === 0) {
        markStep(job, stepId, "done");
        resolve();
        return;
      }

      markStep(job, stepId, "failed");
      reject(new Error(stderr.trim() || `gsplat завершился с кодом ${code}.`));
    });
  });
}

async function summarizeGsplatCudaBuild() {
  const buildDir = path.join(getTorchExtensionsDir(), "gsplat_cuda");

  try {
    const entries = await readdir(buildDir);
    const objectCount = entries.filter((entry) => entry.endsWith(".o")).length;
    const hasSharedObject = entries.some((entry) => entry.endsWith(".so"));

    return { buildDir, hasSharedObject, objectCount };
  } catch {
    return { buildDir, hasSharedObject: false, objectCount: 0 };
  }
}

async function cleanIncompleteGsplatCudaBuild(job: GsplatJob) {
  const summary = await summarizeGsplatCudaBuild();

  if (summary.hasSharedObject || summary.objectCount === 0) {
    return;
  }

  appendLog(
    job,
    `Найдена незавершённая сборка gsplat_cuda (${summary.objectCount} object-файлов). Очищаю кеш сборки.`
  );
  await rm(summary.buildDir, { force: true, recursive: true });
}

function precompileGsplatCuda(job: GsplatJob, trainer: Extract<ResolvedTrainer, { backend: "nerfstudio" }>, settings: GsplatSettings) {
  return new Promise<void>((resolve, reject) => {
    const python = resolveTrainerPython(trainer);
    const script =
      "import importlib; m = importlib.import_module('gsplat.cuda._backend'); " +
      "raise SystemExit(0 if getattr(m, '_C', None) is not None else 1)";
    const args = ["-c", script];
    const timeoutMs = Number(process.env.GSPLAT_PRECOMPILE_TIMEOUT_MS || 30 * 60 * 1000);
    let stderr = "";

    appendLog(job, "Собираю CUDA backend gsplat_cuda. Первый запуск может занять 10-20 минут.");
    appendLog(job, `$ ${python} ${args.join(" ")}`);
    markStep(job, "bootstrap", "running");

    const child = spawn(python, args, {
      env: createGsplatEnv(settings),
    });

    job.process = child;

    const heartbeat = setInterval(() => {
      summarizeGsplatCudaBuild()
        .then((summary) => {
          environmentMessage = summary.hasSharedObject
            ? "Gaussian Splatting runtime готов."
            : `Backend собирает Gaussian Splatting runtime: ${summary.objectCount} object-файлов.`;
          appendLog(
            job,
            `gsplat_cuda build: ${summary.objectCount} object-файлов, ${summary.hasSharedObject ? ".so готов" : ".so ещё нет"}.`
          );
        })
        .catch(() => {
          appendLog(job, "gsplat_cuda build: ожидаю появление файлов сборки.");
        });
    }, 30_000);
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      appendLog(job, `Сборка gsplat_cuda не завершилась за ${Math.round(timeoutMs / 60_000)} минут.`);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => appendLog(job, String(chunk)));
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      appendLog(job, String(chunk));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      markStep(job, "bootstrap", "failed");
      reject(createSpawnError(error, python));
    });
    child.on("close", async (code) => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      job.process = undefined;

      const summary = await summarizeGsplatCudaBuild();

      if (code === 0 && summary.hasSharedObject) {
        appendLog(job, "CUDA backend gsplat_cuda собран.");
        markStep(job, "bootstrap", "done");
        resolve();
        return;
      }

      markStep(job, "bootstrap", "failed");
      reject(
        new Error(
          stderr.trim() ||
            `Не удалось собрать gsplat_cuda: собрано ${summary.objectCount} object-файлов, .so не найден.`
        )
      );
    });
  });
}

function toolCommand(job: GsplatJob, stepId: string, commandName: string, args: string[]) {
  return command(job, stepId, commandName, args, defaultGsplatSettings);
}

function createBootstrapJob(): GsplatJob {
  return {
    projectId: "__startup__",
    status: "running",
    settings: defaultGsplatSettings,
    steps: createSteps(),
    logs: [],
    startedAt: new Date().toISOString(),
  };
}

async function bootstrapNerfstudio(job: GsplatJob): Promise<ResolvedTrainer> {
  const existingTrainer = await resolveTrainer();

  if (existingTrainer) {
    return prepareTrainerRuntime(existingTrainer, job);
  }

  const localTrainer = await resolveLocalNerfstudio();

  if (localTrainer) {
    return prepareTrainerRuntime(localTrainer, job);
  }

  const python = await findPythonForNerfstudio();

  if (!python) {
    markStep(job, "bootstrap", "failed");
    throw new Error("Python 3 не найден, автоматическая установка Nerfstudio невозможна.");
  }

  await mkdir(toolsRoot, { recursive: true });
  await toolCommand(job, "bootstrap", python, ["-m", "venv", nerfstudioVenv]);
  await toolCommand(job, "bootstrap", localNerfstudioCommands().pip, [
    "install",
    "--upgrade",
    "pip",
    "setuptools<81",
    "wheel",
  ]);
  await toolCommand(job, "bootstrap", localNerfstudioCommands().pip, [
    "install",
    "--upgrade",
    nerfstudioPackage,
  ]);
  await toolCommand(job, "bootstrap", localNerfstudioCommands().pip, [
    "install",
    "--upgrade",
    "setuptools<81",
  ]);

  const installedTrainer = await resolveLocalNerfstudio();

  if (!installedTrainer) {
    markStep(job, "bootstrap", "failed");
    throw new Error("Nerfstudio установлен, но ns-train/ns-export не найдены в локальном venv.");
  }

  return prepareTrainerRuntime(installedTrainer, job);
}

async function prepareTrainerRuntime(trainer: ResolvedTrainer, job: GsplatJob): Promise<ResolvedTrainer> {
  if (trainer.backend !== "nerfstudio") {
    markStep(job, "bootstrap", "done");
    return trainer;
  }

  markStep(job, "bootstrap", "running");
  environmentMessage =
    "Backend готовит Gaussian Splatting runtime. Первый запуск может занять 10-20 минут.";

  await patchTorchPybind11();
  await assertNerfstudioCanTrain(trainer, defaultGsplatSettings);
  await mkdir(getTorchExtensionsDir(), { recursive: true });
  await cleanIncompleteGsplatCudaBuild(job);
  await precompileGsplatCuda(job, trainer, defaultGsplatSettings);

  environmentMessage = "Gaussian Splatting готов к запуску.";
  markStep(job, "bootstrap", "done");
  return trainer;
}

async function patchTorchPybind11() {
  const castHeader = path.join(
    nerfstudioVenv,
    "lib",
    "python3.10",
    "site-packages",
    "torch",
    "include",
    "pybind11",
    "cast.h"
  );
  const original = `template <typename T>
typename make_caster<T>::template cast_op_type<T> cast_op(make_caster<T> &caster) {
    return caster.operator typename make_caster<T>::template cast_op_type<T>();
}
template <typename T>
typename make_caster<T>::template cast_op_type<typename std::add_rvalue_reference<T>::type>
cast_op(make_caster<T> &&caster) {
    return std::move(caster).operator typename make_caster<T>::
        template cast_op_type<typename std::add_rvalue_reference<T>::type>();
}
`;
  const patched = `template <typename T>
typename make_caster<T>::template cast_op_type<T> cast_op(make_caster<T> &caster) {
    using result_t = typename make_caster<T>::template cast_op_type<T>;
    return caster.operator result_t();
}
template <typename T>
typename make_caster<T>::template cast_op_type<typename std::add_rvalue_reference<T>::type>
cast_op(make_caster<T> &&caster) {
    using result_t =
        typename make_caster<T>::template cast_op_type<typename std::add_rvalue_reference<T>::type>;
    return std::move(caster).operator result_t();
}
`;

  try {
    const content = await readFile(castHeader, "utf8");

    if (content.includes(original)) {
      await writeFile(castHeader, content.replace(original, patched));
    }
  } catch {
    // Some PyTorch builds may not vendor pybind11 in this exact path.
  }
}

export function ensureGsplatEnvironment() {
  if (environmentPromise) {
    return environmentPromise;
  }

  environmentState = "installing";
  environmentMessage = "Gaussian Splatting готовится.";
  environmentStartedAt = new Date().toISOString();
  const bootstrapJob = createBootstrapJob();

  environmentPromise = bootstrapNerfstudio(bootstrapJob)
    .then((trainer) => {
      environmentState = "ready";
      environmentMessage = "Gaussian Splatting готов к запуску.";
      return trainer;
    })
    .catch((error: unknown) => {
      environmentState = "failed";
      environmentMessage =
        error instanceof Error
          ? `Не удалось подготовить Gaussian Splatting: ${error.message}`
          : "Не удалось подготовить Gaussian Splatting.";
      environmentPromise = null;
      throw error;
    });

  return environmentPromise;
}

async function findFirstFile(root: string, fileName: string): Promise<string | null> {
  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);

      if (entry.isFile() && entry.name === fileName) {
        return entryPath;
      }

      if (entry.isDirectory()) {
        const nested = await findFirstFile(entryPath, fileName);

        if (nested) {
          return nested;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function findFirstPly(root: string): Promise<string | null> {
  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".ply")) {
        return entryPath;
      }

      if (entry.isDirectory()) {
        const nested = await findFirstPly(entryPath);

        if (nested) {
          return nested;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function assertHasColmap(project: Project) {
  const sparsePath = path.join(getProjectFolder(project), "colmap", "sparse", "0");

  await stat(path.join(sparsePath, "cameras.bin"));
  await stat(path.join(sparsePath, "images.bin"));
  await stat(path.join(sparsePath, "points3D.bin"));
}

async function copyColmapModelForNerfstudio(project: Project, datasetPath: string) {
  const sourceSparsePath = path.join(getProjectFolder(project), "colmap", "sparse", "0");
  const targetSparsePath = path.join(datasetPath, "colmap", "sparse", "0");
  const entries = await readdir(sourceSparsePath, { withFileTypes: true });

  await mkdir(targetSparsePath, { recursive: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    await copyFile(path.join(sourceSparsePath, entry.name), path.join(targetSparsePath, entry.name));
  }
}

function resolveTrainerPython(trainer: Extract<ResolvedTrainer, { backend: "nerfstudio" }>) {
  if (trainer.python) {
    return trainer.python;
  }

  return path.join(path.dirname(trainer.nsTrain), "python");
}

async function assertNerfstudioCudaToolkit() {
  const nvcc = await findExecutable("nvcc");

  if (!nvcc) {
    throw new Error(
      "CUDA toolkit не найден: gsplat требует nvcc для сборки CUDA backend. Установите nvidia-cuda-toolkit или CUDA toolkit от NVIDIA, затем перезапустите backend."
    );
  }
}

async function assertNerfstudioCanTrain(
  trainer: Extract<ResolvedTrainer, { backend: "nerfstudio" }>,
  settings: GsplatSettings
) {
  if (!settings.useGpu) {
    throw new Error(
      "Nerfstudio splatfacto требует CUDA GPU. Включите GPU и убедитесь, что установлен NVIDIA driver."
    );
  }

  await assertNerfstudioCudaToolkit();

  const python = resolveTrainerPython(trainer);

  try {
    await access(python);
  } catch {
    return;
  }

  const result = spawnSync(
    python,
    ["-c", "import torch; raise SystemExit(0 if torch.cuda.is_available() and torch.cuda.device_count() > 0 else 1)"],
    {
      env: createGsplatEnv(settings),
      encoding: "utf8",
    }
  );

  if (result.status !== 0) {
    throw new Error(
      "CUDA GPU недоступна для PyTorch. Проверьте NVIDIA driver через nvidia-smi и перезапустите backend после исправления."
    );
  }
}

async function runPipeline(project: Project, job: GsplatJob) {
  const settings = job.settings;
  const workspace = path.join(getProjectFolder(project), "gsplat");
  const datasetPath = path.join(workspace, "dataset");
  const plyPath = path.join(workspace, "splats.ply");
  let trainer: ResolvedTrainer;

  job.output = {
    workspace,
    ply: plyPath,
  };

  markStep(job, "prepare", "running");
  await assertHasColmap(project);
  await rm(workspace, { force: true, recursive: true });
  await mkdir(workspace, { recursive: true });
  await mkdir(getTorchExtensionsDir(), { recursive: true });
  markStep(job, "prepare", "done");
  try {
    trainer = await ensureGsplatEnvironment();
    markStep(job, "bootstrap", "done");
  } catch {
    trainer = await bootstrapNerfstudio(job);
  }

  if (trainer.backend === "custom") {
    await command(
      job,
      "train",
      trainer.command,
      createCustomGsplatArgs(project, settings, workspace, plyPath),
      settings
    );
  } else {
    const exportPath = path.join(workspace, "export");

    await copyColmapModelForNerfstudio(project, datasetPath);
    await command(
      job,
      "dataset",
      trainer.nsProcessData,
      createNerfstudioProcessDataArgs(project, settings, datasetPath),
      settings
    );

    try {
      await assertNerfstudioCanTrain(trainer, settings);
    } catch (error) {
      markStep(job, "train", "failed");
      throw error;
    }

    await command(
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
    await command(
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
    return;
  }

  markStep(job, "export_ply", "running");
  await stat(plyPath);
  markStep(job, "export_ply", "done");
}

export function startGsplatJob(project: Project, input: Partial<GsplatSettings>) {
  const current = jobs.get(project.id);

  if (current?.status === "running") {
    throw new Error("gsplat уже запущен для этого проекта.");
  }

  const job: GsplatJob = {
    projectId: project.id,
    status: "running",
    settings: normalizeGsplatSettings(input),
    steps: createSteps(),
    logs: [],
    startedAt: new Date().toISOString(),
  };

  jobs.set(project.id, job);
  appendLog(job, "gsplat job started.");

  runPipeline(project, job)
    .then(() => {
      job.status = "done";
      job.finishedAt = new Date().toISOString();
      appendLog(job, "gsplat job finished.");
    })
    .catch((error: unknown) => {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "gsplat job failed.";
      appendLog(job, job.error);
    });

  return snapshot(job);
}

export function getGsplatJob(projectId: string): GsplatJobSnapshot {
  const job = jobs.get(projectId);

  if (job) {
    return snapshot(job);
  }

  return {
    projectId,
    status: "idle",
    settings: defaultGsplatSettings,
    steps: createSteps(),
    logs: [],
  };
}

export async function getGsplatResult(project: Project): Promise<GsplatResult> {
  const plyPath = path.join(getProjectFolder(project), "gsplat", "splats.ply");

  try {
    const plyStat = await stat(plyPath);
    const plyVersion = `${Math.round(plyStat.mtimeMs)}-${plyStat.size}`;

    return {
      hasResult: true,
      plyUrl: `/api/projects/${encodeURIComponent(project.id)}/gsplat/splats.ply?v=${plyVersion}`,
    };
  } catch {
    return {
      hasResult: false,
      plyUrl: null,
    };
  }
}

export async function resolveGsplatPly(project: Project) {
  const plyPath = path.join(getProjectFolder(project), "gsplat", "splats.ply");
  const plyStat = await stat(plyPath);

  return {
    path: plyPath,
    size: plyStat.size,
  };
}
