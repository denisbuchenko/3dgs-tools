import type { ViewerCameraPose } from "./viewer/PointCloudViewer";

export type Project = {
  id: string;
  title: string;
  description: string;
  folderName: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPayload = {
  title: string;
  description: string;
};

export type ProjectImage = {
  id: string;
  fileName: string;
  thumbnailName: string;
  originalUrl: string;
  thumbnailUrl: string;
  size: number;
  createdAt: string;
};

export type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

export type VideoSettings = {
  fps: string;
  reductionPercent: string;
  startSecond: string;
  endSecond: string;
};

export type ColmapMatcher = "sequential" | "exhaustive";

export type ColmapSettings = {
  useGpu: boolean;
  gpuIndex: string;
  matcher: ColmapMatcher;
  cameraModel: string;
  singleCamera: boolean;
  maxImageSize: number;
  maxNumFeatures: number;
  guidedMatching: boolean;
  sequentialOverlap: number;
  sequentialLoopDetection: boolean;
  mapperMinNumMatches: number;
  mapperMultipleModels: boolean;
  mapperExtractColors: boolean;
};

export type PipelineStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
};

export type ColmapJob = {
  projectId: string;
  status: "idle" | "running" | "done" | "failed";
  settings: ColmapSettings;
  steps: PipelineStep[];
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  output?: {
    workspace: string;
    sparse: string;
    text: string;
    ply: string;
  };
};

export type ColmapResult = {
  hasResult: boolean;
  plyUrl: string | null;
  cameras: ViewerCameraPose[];
};

export type GsplatQuality = "draft" | "balanced" | "high";
export type GsplatBackground = "black" | "white" | "random";

export type GsplatSettings = {
  quality: GsplatQuality;
  background: GsplatBackground;
  useGpu: boolean;
  gpuIndex: string;
  maxSteps: number;
  resolution: number;
  shDegree: number;
  downscaleFactor: number;
  densificationInterval: number;
  opacityRegularization: number;
};

export type GsplatJob = {
  projectId: string;
  status: "idle" | "running" | "done" | "failed";
  settings: GsplatSettings;
  steps: PipelineStep[];
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  output?: {
    workspace: string;
    ply: string;
  };
};

export type GsplatResult = {
  hasResult: boolean;
  plyUrl: string | null;
};

export type GsplatTrainerStatus = {
  available: boolean;
  backend: "custom" | "nerfstudio" | null;
  command: string | null;
  message: string;
  startedAt: string | null;
};

export type LogMode = "colmap" | "gsplat";
export type ResultMode = "colmap" | "gsplat";
