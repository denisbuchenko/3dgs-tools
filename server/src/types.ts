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
};

export type ColmapJobStatus = "idle" | "running" | "done" | "failed";

export type ColmapJobSnapshot = {
  projectId: string;
  status: ColmapJobStatus;
  settings: ColmapSettings;
  steps: ColmapStep[];
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
