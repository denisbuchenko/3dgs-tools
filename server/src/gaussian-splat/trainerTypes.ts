export type ResolvedTrainer =
  | {
      backend: "custom";
      command: string;
    }
  | {
      backend: "nerfstudio";
      nsProcessData: string;
      nsTrain: string;
      nsExport: string;
      python?: string;
    };
