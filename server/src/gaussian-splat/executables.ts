import { access } from "node:fs/promises";
import path from "node:path";
import { customGsplatBinary, nerfstudioVenv } from "./config.js";
import type { ResolvedTrainer } from "./trainerTypes.js";

export async function findExecutable(command: string) {
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

export async function resolveTrainer(): Promise<ResolvedTrainer | null> {
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

export async function findPythonForNerfstudio() {
  return (await findExecutable("python3.10")) ?? (await findExecutable("python3"));
}

export function localNerfstudioCommands() {
  return {
    nsExport: path.join(nerfstudioVenv, "bin", "ns-export"),
    nsProcessData: path.join(nerfstudioVenv, "bin", "ns-process-data"),
    nsTrain: path.join(nerfstudioVenv, "bin", "ns-train"),
    pip: path.join(nerfstudioVenv, "bin", "pip"),
    python: path.join(nerfstudioVenv, "bin", "python"),
  };
}

export async function resolveLocalNerfstudio(): Promise<ResolvedTrainer | null> {
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

export function resolveTrainerPython(trainer: Extract<ResolvedTrainer, { backend: "nerfstudio" }>) {
  if (trainer.python) {
    return trainer.python;
  }

  return path.join(path.dirname(trainer.nsTrain), "python");
}
