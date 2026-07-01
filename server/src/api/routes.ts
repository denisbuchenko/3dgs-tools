export type ImageFileRoute = {
  projectId: string;
  imageId: string;
  variant: "original" | "thumbnail";
};

export type ImageRoute = {
  projectId: string;
  imageId: string;
};

function projectRoute(pathname: string, suffix = "") {
  const match = pathname.match(new RegExp(`^/api/projects/([^/]+)${suffix}$`));

  return match ? decodeURIComponent(match[1]) : null;
}

export function getProjectId(pathname: string) {
  return projectRoute(pathname);
}

export function getProjectImagesRoute(pathname: string) {
  return projectRoute(pathname, "/images");
}

export function getProjectVideosRoute(pathname: string) {
  return projectRoute(pathname, "/videos");
}

export function getProjectColmapRoute(pathname: string) {
  return projectRoute(pathname, "/colmap");
}

export function getProjectColmapDefaultsRoute(pathname: string) {
  return projectRoute(pathname, "/colmap/defaults");
}

export function getProjectColmapResultRoute(pathname: string) {
  return projectRoute(pathname, "/colmap/result");
}

export function getProjectColmapPlyRoute(pathname: string) {
  return projectRoute(pathname, "/colmap/points\\.ply");
}

export function getProjectGsplatRoute(pathname: string) {
  return projectRoute(pathname, "/gsplat");
}

export function getProjectGsplatDefaultsRoute(pathname: string) {
  return projectRoute(pathname, "/gsplat/defaults");
}

export function getProjectGsplatStatusRoute(pathname: string) {
  return projectRoute(pathname, "/gsplat/status");
}

export function getProjectGsplatResultRoute(pathname: string) {
  return projectRoute(pathname, "/gsplat/result");
}

export function getProjectGsplatPlyRoute(pathname: string) {
  return projectRoute(pathname, "/gsplat/splats\\.ply");
}

export function getProjectImageFileRoute(pathname: string): ImageFileRoute | null {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/images\/([^/]+)\/(original|thumbnail)$/);

  if (!match) {
    return null;
  }

  return {
    projectId: decodeURIComponent(match[1]),
    imageId: decodeURIComponent(match[2]),
    variant: match[3] as "original" | "thumbnail",
  };
}

export function getProjectImageRoute(pathname: string): ImageRoute | null {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/images\/([^/]+)$/);

  if (!match) {
    return null;
  }

  return {
    projectId: decodeURIComponent(match[1]),
    imageId: decodeURIComponent(match[2]),
  };
}
