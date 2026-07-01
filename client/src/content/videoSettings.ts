import type { VideoSettings } from "../types";

export const emptyVideoSettings: VideoSettings = {
  fps: "",
  reductionPercent: "",
  startSecond: "",
  endSecond: "",
};

export const defaultVideoSettings: VideoSettings = {
  fps: "1",
  reductionPercent: "0",
  startSecond: "0",
  endSecond: "",
};
