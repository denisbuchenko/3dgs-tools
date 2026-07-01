import type {
  ColmapJob,
  ColmapResult,
  ColmapSettings,
  GsplatJob,
  GsplatResult,
  GsplatSettings,
  GsplatTrainerStatus,
  Project,
  ProjectImage,
  ProjectPayload,
  VideoSettings,
} from "../types";

export const apiOrigin = import.meta.env.DEV ? "http://localhost:3000" : "";

const apiBaseUrl = `${apiOrigin}/api`;

export function liveWebSocketUrl(projectId: string) {
  const origin = apiOrigin || window.location.origin;
  const url = new URL("/api/live", origin);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("projectId", projectId);

  return url.toString();
}

export async function requestProjects() {
  const response = await fetch(`${apiBaseUrl}/projects`);

  if (!response.ok) {
    throw new Error("Не удалось загрузить проекты.");
  }

  return (await response.json()) as Project[];
}

export async function createProject(payload: ProjectPayload) {
  const response = await fetch(`${apiBaseUrl}/projects`, {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Не удалось создать проект.");
  }

  return (await response.json()) as Project;
}

export async function updateProject(id: string, payload: ProjectPayload) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(id)}`, {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error("Не удалось обновить проект.");
  }

  return (await response.json()) as Project;
}

export async function deleteProject(id: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Не удалось удалить проект.");
  }
}

export async function requestProjectImages(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/images`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить изображения.");
  }

  return (await response.json()) as ProjectImage[];
}

export async function uploadProjectImages(projectId: string, files: FileList) {
  const form = new FormData();

  Array.from(files).forEach((file) => {
    form.append("images", file);
  });

  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/images`, {
    body: form,
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить изображения.");
  }

  return (await response.json()) as ProjectImage[];
}

export async function uploadProjectVideo(projectId: string, file: File, settings: VideoSettings) {
  const form = new FormData();
  const reductionPercent = Math.min(99, Math.max(0, Number(settings.reductionPercent) || 0));

  form.append("video", file);
  form.append("fps", settings.fps);
  form.append("scalePercent", String(100 - reductionPercent));
  form.append("startSecond", settings.startSecond);
  form.append("endSecond", settings.endSecond);

  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/videos`, {
    body: form,
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Не удалось обработать видео.");
  }

  return (await response.json()) as ProjectImage[];
}

export async function deleteProjectImage(projectId: string, imageId: string) {
  const response = await fetch(
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error("Не удалось удалить изображение.");
  }
}

export async function deleteAllProjectImages(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/images`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Не удалось удалить изображения.");
  }
}

export async function requestColmapDefaults(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/colmap/defaults`);

  if (!response.ok) {
    throw new Error("Не удалось загрузить настройки COLMAP.");
  }

  return (await response.json()) as ColmapSettings;
}

export async function requestColmapJob(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/colmap`);

  if (!response.ok) {
    throw new Error("Не удалось получить статус COLMAP.");
  }

  return (await response.json()) as ColmapJob;
}

export async function startColmap(projectId: string, settings: ColmapSettings) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/colmap`, {
    body: JSON.stringify({ settings }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Не удалось запустить COLMAP.");
  }

  return (await response.json()) as ColmapJob;
}

export async function requestColmapResult(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/colmap/result`);

  if (!response.ok) {
    throw new Error("Не удалось получить результат COLMAP.");
  }

  return (await response.json()) as ColmapResult;
}

export async function requestGsplatDefaults(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/gsplat/defaults`);

  if (!response.ok) {
    throw new Error("Не удалось загрузить настройки gsplat.");
  }

  return (await response.json()) as GsplatSettings;
}

export async function requestGsplatJob(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/gsplat`);

  if (!response.ok) {
    throw new Error("Не удалось получить статус gsplat.");
  }

  return (await response.json()) as GsplatJob;
}

export async function requestGsplatStatus(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/gsplat/status`);

  if (!response.ok) {
    throw new Error("Не удалось проверить gsplat.");
  }

  return (await response.json()) as GsplatTrainerStatus;
}

export async function startGsplat(projectId: string, settings: GsplatSettings) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/gsplat`, {
    body: JSON.stringify({ settings }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Не удалось запустить gsplat.");
  }

  return (await response.json()) as GsplatJob;
}

export async function requestGsplatResult(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/gsplat/result`);

  if (!response.ok) {
    throw new Error("Не удалось получить результат gsplat.");
  }

  return (await response.json()) as GsplatResult;
}
