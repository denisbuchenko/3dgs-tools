import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTorchExtensionsDir } from "./config.js";
import type { GsplatSettings } from "../types.js";

export function createGsplatEnv(settings: GsplatSettings) {
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
