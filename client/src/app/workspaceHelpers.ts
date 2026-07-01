import type { VideoMetadata, VideoSettings } from "../types";

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function pollJob<Job extends { status: string }>(
  projectId: string | null,
  status: string | undefined,
  requestJob: (projectId: string) => Promise<Job>,
  setJob: (job: Job) => void,
  fallbackMessage: string
) {
  if (!projectId || status !== "running") {
    return undefined;
  }

  const timer = window.setInterval(() => {
    requestJob(projectId).then(setJob).catch((error: unknown) => {
      console.error(errorMessage(error, fallbackMessage));
    });
  }, 1500);

  return () => window.clearInterval(timer);
}

export function readVideoMetadata(
  file: File,
  setVideoMetadata: (metadata: VideoMetadata) => void,
  setVideoSettings: (settings: (current: VideoSettings) => VideoSettings) => void,
  setError: (message: string) => void
) {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);

  video.preload = "metadata";
  video.src = objectUrl;
  video.onloadedmetadata = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    setVideoMetadata({
      duration,
      width: video.videoWidth,
      height: video.videoHeight,
    });
    setVideoSettings((current) => ({
      ...current,
      fps: "1",
      reductionPercent: "0",
      startSecond: "0",
      endSecond: duration ? duration.toFixed(2) : "",
    }));
    URL.revokeObjectURL(objectUrl);
  };
  video.onerror = () => {
    setError("");
    URL.revokeObjectURL(objectUrl);
  };
}

export function isVideoRangeValid(settings: VideoSettings, metadata: VideoMetadata | null) {
  const startSecond = Number(settings.startSecond);
  const endSecond = settings.endSecond === "" ? null : Number(settings.endSecond);

  return (
    Number.isFinite(startSecond) &&
    startSecond >= 0 &&
    (endSecond === null ||
      (Number.isFinite(endSecond) &&
        endSecond > startSecond &&
        (metadata === null || endSecond <= metadata.duration)))
  );
}
