import { spawn } from "node:child_process";
import { appendColmapLog, markColmapStep, type ColmapJob } from "./jobState.js";

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

export function runColmapCommand(job: ColmapJob, stepId: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    appendColmapLog(job, `$ ${colmapBinary} ${args.join(" ")}`);
    markColmapStep(job, stepId, "running");

    const child = spawn(colmapBinary, args, {
      env: createColmapEnv(),
    });
    let stderr = "";

    job.process = child;

    child.stdout.on("data", (chunk) => appendColmapLog(job, String(chunk)));
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      appendColmapLog(job, String(chunk));
    });
    child.on("error", (error) => {
      markColmapStep(job, stepId, "failed");
      reject(error);
    });
    child.on("close", (code) => {
      job.process = undefined;

      if (code === 0) {
        markColmapStep(job, stepId, "done");
        resolve();
        return;
      }

      markColmapStep(job, stepId, "failed");
      reject(createColmapError(code, stderr));
    });
  });
}
