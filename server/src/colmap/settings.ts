import type { ColmapSettings } from "../types.js";

export const defaultColmapSettings: ColmapSettings = {
  useGpu: true,
  gpuIndex: "0",
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
    useGpu: input.useGpu ?? defaultColmapSettings.useGpu,
    gpuIndex:
      typeof input.gpuIndex === "string" && input.gpuIndex.trim()
        ? input.gpuIndex.trim()
        : defaultColmapSettings.gpuIndex,
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
