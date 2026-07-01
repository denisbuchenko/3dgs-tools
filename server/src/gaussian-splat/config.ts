import path from "node:path";
import { serverRoot } from "../storage.js";

export const customGsplatBinary = process.env.GSPLAT_BIN || null;
export const toolsRoot = path.join(serverRoot, "tools");
export const nerfstudioVenv = process.env.GSPLAT_VENV || path.join(toolsRoot, "nerfstudio");
export const nerfstudioPackage = process.env.GSPLAT_BOOTSTRAP_PACKAGE || "nerfstudio";

export function getTorchExtensionsDir() {
  return process.env.TORCH_EXTENSIONS_DIR || path.join(toolsRoot, "torch_extensions");
}
