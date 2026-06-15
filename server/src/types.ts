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
