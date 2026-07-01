import type { GsplatSettings } from "../types.js";

export const defaultGsplatSettings: GsplatSettings = {
  quality: "balanced",
  background: "random",
  useGpu: true,
  gpuIndex: "0",
  maxSteps: 30000,
  resolution: 1920,
  shDegree: 3,
  downscaleFactor: 3,
  densificationInterval: 100,
  opacityRegularization: 0.0,
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeGsplatSettings(input: Partial<GsplatSettings> = {}): GsplatSettings {
  return {
    quality:
      input.quality === "draft" || input.quality === "high"
        ? input.quality
        : defaultGsplatSettings.quality,
    background:
      input.background === "black" || input.background === "white" || input.background === "random"
        ? input.background
        : defaultGsplatSettings.background,
    useGpu: input.useGpu ?? defaultGsplatSettings.useGpu,
    gpuIndex: typeof input.gpuIndex === "string" && input.gpuIndex.trim() ? input.gpuIndex.trim() : "0",
    maxSteps: Math.round(clamp(Number(input.maxSteps) || defaultGsplatSettings.maxSteps, 500, 30000)),
    resolution: Math.round(clamp(Number(input.resolution) || defaultGsplatSettings.resolution, 384, 4096)),
    shDegree: Math.round(clamp(Number(input.shDegree) || defaultGsplatSettings.shDegree, 0, 4)),
    downscaleFactor: Math.round(clamp(Number(input.downscaleFactor) || defaultGsplatSettings.downscaleFactor, 0, 4)),
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
