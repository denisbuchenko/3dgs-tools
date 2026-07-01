export type VideoFields = {
  fps?: string;
  scalePercent?: string;
  startSecond?: string;
  endSecond?: string;
};

export type VideoOptions = {
  fps: number;
  scalePercent: number;
  startSecond: number;
  endSecond: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeVideoOptions(fields: VideoFields): VideoOptions {
  const fps = Math.round(clamp(Number(fields.fps) || 1, 1, 30));
  const scalePercent = clamp(Number(fields.scalePercent) || 100, 1, 100);
  const startSecond = Math.max(0, Number(fields.startSecond) || 0);
  const rawEndSecond = Number(fields.endSecond);
  const endSecond =
    Number.isFinite(rawEndSecond) && rawEndSecond > startSecond ? rawEndSecond : null;

  return {
    fps,
    scalePercent,
    startSecond,
    endSecond,
  };
}
