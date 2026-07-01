import { spawn } from "node:child_process";
import { appendColmapLog, markColmapStep, type ColmapJob } from "./jobState.js";
import { startDatabaseStatsPoller } from "./databaseStats.js";
import { completeStepProgress, ingestColmapOutput } from "./metrics.js";
import { startSparsePreviewPoller } from "./sparsePreview.js";
import { startLivePlyPublisher } from "./livePly.js";

const colmapBinary = process.env.COLMAP_BIN || "/usr/bin/colmap";

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

type ColmapCommandOptions = {
  databasePath?: string;
  livePly?: {
    modelPaths: string[];
    projectId: string;
    workspace: string;
  };
  previewModelPath?: string;
};

export function runColmapCommand(
  job: ColmapJob,
  stepId: string,
  args: string[],
  options: ColmapCommandOptions = {}
) {
  return new Promise<void>((resolve, reject) => {
    appendColmapLog(job, `$ ${colmapBinary} ${args.join(" ")}`);
    markColmapStep(job, stepId, "running");
    const databasePoller = startDatabaseStatsPoller(job, options.databasePath ?? null);
    const previewPoller = startSparsePreviewPoller(job, options.previewModelPath ?? null);
    const livePlyPublisher = startLivePlyPublisher(
      job,
      options.livePly?.projectId ?? "",
      options.livePly?.modelPaths ?? [],
      options.livePly?.workspace ?? ""
    );

    const child = spawn(colmapBinary, args, {
      env: createColmapEnv(),
    });
    let stderr = "";

    job.process = child;

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      appendColmapLog(job, text);
      ingestColmapOutput(job, stepId, text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      appendColmapLog(job, text);
      ingestColmapOutput(job, stepId, text);
    });
    child.on("error", (error) => {
      databasePoller.stop();
      previewPoller.stop();
      livePlyPublisher.stop();
      markColmapStep(job, stepId, "failed");
      reject(error);
    });
    child.on("close", (code) => {
      databasePoller.stop();
      previewPoller.stop();
      livePlyPublisher.stop();
      job.process = undefined;

      if (code === 0) {
        completeStepProgress(job, stepId);
        markColmapStep(job, stepId, "done");
        resolve();
        return;
      }

      markColmapStep(job, stepId, "failed");
      reject(createColmapError(code, stderr));
    });
  });
}
