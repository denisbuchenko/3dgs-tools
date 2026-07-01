import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getTorchExtensionsDir, nerfstudioPackage, nerfstudioVenv, toolsRoot } from "./config.js";
import { createGsplatEnv } from "./environment.js";
import {
  findExecutable,
  findPythonForNerfstudio,
  localNerfstudioCommands,
  resolveLocalNerfstudio,
  resolveTrainer,
  resolveTrainerPython,
} from "./executables.js";
import { appendGsplatLog, createGsplatSteps, markGsplatStep, type GsplatJob } from "./jobState.js";
import { createSpawnError, runGsplatToolCommand } from "./process.js";
import { defaultGsplatSettings } from "./settings.js";
import type { ResolvedTrainer } from "./trainerTypes.js";
import type { GsplatSettings, GsplatTrainerStatus } from "../types.js";

let environmentState: "idle" | "installing" | "ready" | "failed" = "idle";
let environmentMessage = "Gaussian Splatting готовится.";
let environmentPromise: Promise<ResolvedTrainer> | null = null;
let environmentStartedAt: string | null = null;

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
    return await statusForNerfstudioTrainer();
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
    return await statusForNerfstudioTrainer();
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

async function statusForNerfstudioTrainer(): Promise<GsplatTrainerStatus> {
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

function createBootstrapJob(): GsplatJob {
  return {
    projectId: "__startup__",
    status: "running",
    settings: defaultGsplatSettings,
    steps: createGsplatSteps(),
    logs: [],
    startedAt: new Date().toISOString(),
  };
}

export async function bootstrapNerfstudio(job: GsplatJob): Promise<ResolvedTrainer> {
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
    markGsplatStep(job, "bootstrap", "failed");
    throw new Error("Python 3 не найден, автоматическая установка Nerfstudio невозможна.");
  }

  await mkdir(toolsRoot, { recursive: true });
  await runGsplatToolCommand(job, "bootstrap", python, ["-m", "venv", nerfstudioVenv]);
  await runGsplatToolCommand(job, "bootstrap", localNerfstudioCommands().pip, [
    "install",
    "--upgrade",
    "pip",
    "setuptools<81",
    "wheel",
  ]);
  await runGsplatToolCommand(job, "bootstrap", localNerfstudioCommands().pip, [
    "install",
    "--upgrade",
    nerfstudioPackage,
  ]);
  await runGsplatToolCommand(job, "bootstrap", localNerfstudioCommands().pip, [
    "install",
    "--upgrade",
    "setuptools<81",
  ]);

  const installedTrainer = await resolveLocalNerfstudio();

  if (!installedTrainer) {
    markGsplatStep(job, "bootstrap", "failed");
    throw new Error("Nerfstudio установлен, но ns-train/ns-export не найдены в локальном venv.");
  }

  return prepareTrainerRuntime(installedTrainer, job);
}

async function prepareTrainerRuntime(trainer: ResolvedTrainer, job: GsplatJob): Promise<ResolvedTrainer> {
  if (trainer.backend !== "nerfstudio") {
    markGsplatStep(job, "bootstrap", "done");
    return trainer;
  }

  markGsplatStep(job, "bootstrap", "running");
  environmentMessage =
    "Backend готовит Gaussian Splatting runtime. Первый запуск может занять 10-20 минут.";

  await patchTorchPybind11();
  await assertNerfstudioCanTrain(trainer, defaultGsplatSettings);
  await mkdir(getTorchExtensionsDir(), { recursive: true });
  await cleanIncompleteGsplatCudaBuild(job);
  await precompileGsplatCuda(job, trainer, defaultGsplatSettings);

  environmentMessage = "Gaussian Splatting готов к запуску.";
  markGsplatStep(job, "bootstrap", "done");
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

  appendGsplatLog(
    job,
    `Найдена незавершённая сборка gsplat_cuda (${summary.objectCount} object-файлов). Очищаю кеш сборки.`
  );
  await rm(summary.buildDir, { force: true, recursive: true });
}

function precompileGsplatCuda(
  job: GsplatJob,
  trainer: Extract<ResolvedTrainer, { backend: "nerfstudio" }>,
  settings: GsplatSettings
) {
  return new Promise<void>((resolve, reject) => {
    const python = resolveTrainerPython(trainer);
    const script =
      "import importlib; m = importlib.import_module('gsplat.cuda._backend'); " +
      "raise SystemExit(0 if getattr(m, '_C', None) is not None else 1)";
    const args = ["-c", script];
    const timeoutMs = Number(process.env.GSPLAT_PRECOMPILE_TIMEOUT_MS || 30 * 60 * 1000);
    let stderr = "";

    appendGsplatLog(job, "Собираю CUDA backend gsplat_cuda. Первый запуск может занять 10-20 минут.");
    appendGsplatLog(job, `$ ${python} ${args.join(" ")}`);
    markGsplatStep(job, "bootstrap", "running");

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
          appendGsplatLog(
            job,
            `gsplat_cuda build: ${summary.objectCount} object-файлов, ${summary.hasSharedObject ? ".so готов" : ".so ещё нет"}.`
          );
        })
        .catch(() => {
          appendGsplatLog(job, "gsplat_cuda build: ожидаю появление файлов сборки.");
        });
    }, 30_000);
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      appendGsplatLog(job, `Сборка gsplat_cuda не завершилась за ${Math.round(timeoutMs / 60_000)} минут.`);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => appendGsplatLog(job, String(chunk)));
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      appendGsplatLog(job, String(chunk));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      markGsplatStep(job, "bootstrap", "failed");
      reject(createSpawnError(error, python));
    });
    child.on("close", async (code) => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      job.process = undefined;

      const summary = await summarizeGsplatCudaBuild();

      if (code === 0 && summary.hasSharedObject) {
        appendGsplatLog(job, "CUDA backend gsplat_cuda собран.");
        markGsplatStep(job, "bootstrap", "done");
        resolve();
        return;
      }

      markGsplatStep(job, "bootstrap", "failed");
      reject(
        new Error(
          stderr.trim() ||
            `Не удалось собрать gsplat_cuda: собрано ${summary.objectCount} object-файлов, .so не найден.`
        )
      );
    });
  });
}

async function assertNerfstudioCudaToolkit() {
  const nvcc = await findExecutable("nvcc");

  if (!nvcc) {
    throw new Error(
      "CUDA toolkit не найден: gsplat требует nvcc для сборки CUDA backend. Установите nvidia-cuda-toolkit или CUDA toolkit от NVIDIA, затем перезапустите backend."
    );
  }
}

export async function assertNerfstudioCanTrain(
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
