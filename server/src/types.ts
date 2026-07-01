export type Project = {
  id: string;
  title: string;
  description: string;
  folderName: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  title?: unknown;
  description?: unknown;
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

export type ColmapStepStatus = "pending" | "running" | "done" | "failed";

export type ColmapStep = {
  id: string;
  label: string;
  status: ColmapStepStatus;
  startedAt?: string;
  finishedAt?: string;
  progress?: {
    current: number;
    total: number;
    percent: number;
    message?: string;
  };
};

export type ColmapWarning = {
  id: string;
  message: string;
  createdAt: string;
};

export type ColmapMetricPoint = {
  timestamp: string;
  keypoints: number;
  matches: number;
  geometries: number;
  points: number;
};

export type ColmapMetrics = {
  imageCount: number;
  featureImages: number;
  featureKeypoints: number;
  matchedPairs: number;
  verifiedPairs: number;
  databaseMatches: number;
  databaseGeometries: number;
  mapperImages: number;
  mapperPoints: number;
  series: ColmapMetricPoint[];
  warnings: ColmapWarning[];
};

export type ColmapPreviewPoint = {
  position: [number, number, number];
  color: [number, number, number];
};

export type ColmapLivePreview = {
  totalPoints: number;
  points: ColmapPreviewPoint[];
  updatedAt: string;
};

export type ColmapLivePly = {
  plyUrl: string;
  version: string;
  pointCount: number;
  totalPoints: number;
  cameras: ColmapCameraPose[];
  updatedAt: string;
};

export type ColmapJobStatus = "idle" | "running" | "done" | "failed";

export type ColmapJobSnapshot = {
  projectId: string;
  status: ColmapJobStatus;
  settings: ColmapSettings;
  steps: ColmapStep[];
  logs: string[];
  metrics: ColmapMetrics;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  preview?: ColmapLivePreview;
  livePly?: ColmapLivePly;
  output?: {
    workspace: string;
    sparse: string;
    text: string;
    ply: string;
  };
};

export type ColmapCameraPose = {
  id: number;
  name: string;
  cameraId: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
};

export type ColmapResult = {
  hasResult: boolean;
  plyUrl: string | null;
  cameras: ColmapCameraPose[];
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

export type GsplatTrainerStatus = {
  available: boolean;
  backend: "custom" | "nerfstudio" | null;
  command: string | null;
  message: string;
  startedAt: string | null;
};

export type GsplatStepStatus = "pending" | "running" | "done" | "failed";

export type GsplatStep = {
  id: string;
  label: string;
  status: GsplatStepStatus;
  startedAt?: string;
  finishedAt?: string;
};

export type GsplatJobStatus = "idle" | "running" | "done" | "failed";

export type GsplatJobSnapshot = {
  projectId: string;
  status: GsplatJobStatus;
  settings: GsplatSettings;
  steps: GsplatStep[];
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
