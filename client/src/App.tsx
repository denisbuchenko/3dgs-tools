import {
  ChangeEvent,
  FormEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ViewerCameraPose } from "./viewer/PointCloudViewer";

const PointCloudViewer = lazy(() =>
  import("./viewer/PointCloudViewer").then((module) => ({ default: module.PointCloudViewer }))
);

type Project = {
  id: string;
  title: string;
  description: string;
  folderName: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectPayload = {
  title: string;
  description: string;
};

type ProjectImage = {
  id: string;
  fileName: string;
  thumbnailName: string;
  originalUrl: string;
  thumbnailUrl: string;
  size: number;
  createdAt: string;
};

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

type VideoSettings = {
  fps: string;
  reductionPercent: string;
  startSecond: string;
  endSecond: string;
};

type ColmapMatcher = "sequential" | "exhaustive";

type ColmapSettings = {
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

type ColmapStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
};

type ColmapJob = {
  projectId: string;
  status: "idle" | "running" | "done" | "failed";
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

type ColmapResult = {
  hasResult: boolean;
  plyUrl: string | null;
  cameras: ViewerCameraPose[];
};

const apiOrigin = import.meta.env.DEV ? "http://localhost:3000" : "";
const apiBaseUrl = `${apiOrigin}/api`;
const defaultVideoSettings: VideoSettings = {
  fps: "1",
  reductionPercent: "0",
  startSecond: "0",
  endSecond: "",
};

async function requestProjects() {
  const response = await fetch(`${apiBaseUrl}/projects`);

  if (!response.ok) {
    throw new Error("Не удалось загрузить проекты.");
  }

  return (await response.json()) as Project[];
}

async function createProject(payload: ProjectPayload) {
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

async function updateProject(id: string, payload: ProjectPayload) {
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

async function deleteProject(id: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Не удалось удалить проект.");
  }
}

async function requestProjectImages(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/images`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить изображения.");
  }

  return (await response.json()) as ProjectImage[];
}

async function uploadProjectImages(projectId: string, files: FileList) {
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

async function uploadProjectVideo(projectId: string, file: File, settings: VideoSettings) {
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

async function deleteProjectImage(projectId: string, imageId: string) {
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

async function deleteAllProjectImages(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/images`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Не удалось удалить изображения.");
  }
}

async function requestColmapDefaults(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/colmap/defaults`);

  if (!response.ok) {
    throw new Error("Не удалось загрузить настройки COLMAP.");
  }

  return (await response.json()) as ColmapSettings;
}

async function requestColmapJob(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/colmap`);

  if (!response.ok) {
    throw new Error("Не удалось получить статус COLMAP.");
  }

  return (await response.json()) as ColmapJob;
}

async function startColmap(projectId: string, settings: ColmapSettings) {
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

async function requestColmapResult(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/colmap/result`);

  if (!response.ok) {
    throw new Error("Не удалось получить результат COLMAP.");
  }

  return (await response.json()) as ColmapResult;
}

function mediaUrl(url: string) {
  return `${apiOrigin}${url}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    fps: "",
    reductionPercent: "",
    startSecond: "",
    endSecond: "",
  });
  const [colmapSettings, setColmapSettings] = useState<ColmapSettings | null>(null);
  const [colmapJob, setColmapJob] = useState<ColmapJob | null>(null);
  const [colmapResult, setColmapResult] = useState<ColmapResult | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isColmapLoading, setIsColmapLoading] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [logScrollTop, setLogScrollTop] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<ProjectImage | null>(null);
  const [openImageMenuId, setOpenImageMenuId] = useState<string | null>(null);
  const [isLightboxMenuOpen, setIsLightboxMenuOpen] = useState(false);
  const [isGalleryExpanded, setIsGalleryExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImagesLoading, setIsImagesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const logViewportRef = useRef<HTMLDivElement>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId]
  );
  const colmapLogs = colmapJob?.logs ?? [];
  const logRowHeight = 22;
  const logViewportHeight = 420;
  const firstLogIndex = Math.max(0, Math.floor(logScrollTop / logRowHeight) - 8);
  const visibleLogCount = Math.ceil(logViewportHeight / logRowHeight) + 16;
  const visibleLogs = colmapLogs.slice(firstLogIndex, firstLogIndex + visibleLogCount);

  useEffect(() => {
    requestProjects()
      .then((loadedProjects) => {
        setProjects(loadedProjects);
        setSelectedId(loadedProjects[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Ошибка загрузки.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setImages([]);
      return;
    }

    setIsImagesLoading(true);
    setIsGalleryExpanded(false);
    setLightboxImage(null);
    setOpenImageMenuId(null);
    setIsLightboxMenuOpen(false);
    setIsVideoModalOpen(false);
    setColmapSettings(null);
    setColmapJob(null);
    setColmapResult(null);
    setIsResultOpen(false);

    requestProjectImages(selectedId)
      .then(setImages)
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Ошибка загрузки изображений.");
      })
      .finally(() => setIsImagesLoading(false));

    requestColmapDefaults(selectedId)
      .then(setColmapSettings)
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Ошибка загрузки COLMAP.");
      });

    requestColmapJob(selectedId)
      .then(setColmapJob)
      .catch(() => undefined);

    requestColmapResult(selectedId)
      .then(setColmapResult)
      .catch(() => undefined);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || colmapJob?.status !== "running") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      requestColmapJob(selectedId)
        .then(setColmapJob)
        .catch((requestError: unknown) => {
          setError(requestError instanceof Error ? requestError.message : "Ошибка статуса COLMAP.");
        });
    }, 1500);

    return () => window.clearInterval(timer);
  }, [colmapJob?.status, selectedId]);

  useEffect(() => {
    if (!isLogsOpen || !logViewportRef.current) {
      return;
    }

    const nextScrollTop = Math.max(0, colmapLogs.length * logRowHeight - logViewportHeight);
    logViewportRef.current.scrollTop = nextScrollTop;
    setLogScrollTop(nextScrollTop);
  }, [isLogsOpen, colmapLogs.length]);

  useEffect(() => {
    if (!selectedId || colmapJob?.status !== "done") {
      return;
    }

    requestColmapResult(selectedId)
      .then(setColmapResult)
      .catch(() => undefined);
  }, [colmapJob?.status, selectedId]);

  async function handleSubmitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
    };

    if (!payload.title) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      if (modalMode === "edit" && selectedProject) {
        const updatedProject = await updateProject(selectedProject.id, payload);
        setProjects((current) =>
          current.map((project) =>
            project.id === updatedProject.id ? updatedProject : project
          )
        );
        setSelectedId(updatedProject.id);
      } else {
        const newProject = await createProject(payload);
        setProjects((current) => [newProject, ...current]);
        setSelectedId(newProject.id);
      }

      setModalMode(null);
      event.currentTarget.reset();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка сохранения.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedProject) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await deleteProject(selectedProject.id);
      const remaining = projects.filter((project) => project.id !== selectedProject.id);
      setProjects(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка удаления.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUploadImages(event: ChangeEvent<HTMLInputElement>) {
    if (!selectedProject || !event.target.files?.length) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const uploadedImages = await uploadProjectImages(selectedProject.id, event.target.files);
      setImages(uploadedImages);
      setLightboxImage(null);
      setOpenImageMenuId(null);
      setIsLightboxMenuOpen(false);
      setProjects((current) =>
        current.map((project) =>
          project.id === selectedProject.id
            ? { ...project, updatedAt: new Date().toISOString() }
            : project
        )
      );
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка загрузки изображений.");
    } finally {
      setIsSaving(false);
      event.target.value = "";
    }
  }

  function handleVideoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setVideoFile(file);
    setVideoMetadata(null);
    setVideoSettings(
      file
        ? defaultVideoSettings
        : {
            fps: "",
            reductionPercent: "",
            startSecond: "",
            endSecond: "",
          }
    );
    setError("");

    if (!file) {
      return;
    }

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

  function updateVideoSetting(name: keyof VideoSettings, value: string) {
    setVideoSettings((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function closeVideoModal() {
    setIsVideoModalOpen(false);
    setVideoFile(null);
    setVideoMetadata(null);
    setVideoSettings({
      fps: "",
      reductionPercent: "",
      startSecond: "",
      endSecond: "",
    });

    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProject || !videoFile) {
      return;
    }

    const startSecond = Number(videoSettings.startSecond);
    const endSecond = videoSettings.endSecond === "" ? null : Number(videoSettings.endSecond);

    if (
      !Number.isFinite(startSecond) ||
      startSecond < 0 ||
      (endSecond !== null &&
        (!Number.isFinite(endSecond) ||
          endSecond <= startSecond ||
          (videoMetadata !== null && endSecond > videoMetadata.duration)))
    ) {
      setError(
        videoMetadata
          ? "Проверьте диапазон секунд: он должен быть внутри длительности видео."
          : "Проверьте диапазон секунд: конец должен быть больше начала."
      );
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const uploadedImages = await uploadProjectVideo(selectedProject.id, videoFile, videoSettings);
      setImages(uploadedImages);
      setLightboxImage(null);
      setOpenImageMenuId(null);
      setIsLightboxMenuOpen(false);
      setProjects((current) =>
        current.map((project) =>
          project.id === selectedProject.id
            ? { ...project, updatedAt: new Date().toISOString() }
            : project
        )
      );
      closeVideoModal();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка обработки видео.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteImage(image: ProjectImage) {
    if (!selectedProject) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await deleteProjectImage(selectedProject.id, image.id);
      setImages((current) => current.filter((item) => item.id !== image.id));
      setOpenImageMenuId(null);

      if (lightboxImage?.id === image.id) {
        setLightboxImage(null);
        setIsLightboxMenuOpen(false);
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка удаления изображения.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAllImages() {
    if (!selectedProject || images.length === 0) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await deleteAllProjectImages(selectedProject.id);
      setImages([]);
      setLightboxImage(null);
      setOpenImageMenuId(null);
      setIsLightboxMenuOpen(false);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка удаления изображений.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateColmapSetting<Key extends keyof ColmapSettings>(
    key: Key,
    value: ColmapSettings[Key]
  ) {
    setColmapSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleStartColmap() {
    if (!selectedProject || !colmapSettings) {
      return;
    }

    setIsColmapLoading(true);
    setError("");

    try {
      const job = await startColmap(selectedProject.id, colmapSettings);
      setColmapJob(job);
      setColmapResult(null);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка запуска COLMAP.");
    } finally {
      setIsColmapLoading(false);
    }
  }

  const isModalOpen = modalMode !== null;
  const modalProject = modalMode === "edit" ? selectedProject : null;
  const visibleImages = isGalleryExpanded ? images : images.slice(0, 4);
  const resultPlyUrl = colmapResult?.plyUrl ? mediaUrl(colmapResult.plyUrl) : null;

  return (
    <main className="workspace">
      <aside className="sidebar" aria-label="Проекты">
        <button className="create-button" type="button" onClick={() => setModalMode("create")}>
          <span aria-hidden="true">+</span>
          <span>Создать проект</span>
        </button>

        <div className="project-list">
          {isLoading ? <p className="side-note">Загрузка...</p> : null}

          {projects.map((project) => (
            <button
              className={project.id === selectedId ? "project-item active" : "project-item"}
              key={project.id}
              type="button"
              onClick={() => setSelectedId(project.id)}
            >
              <span className="project-title">{project.title}</span>
              <span className="project-meta">{formatDate(project.updatedAt)}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="details" aria-label="Детали проекта">
        {selectedProject ? (
          <div className="project-view">
            <header className="details-header">
              <div>
                <p className="eyebrow">Проект</p>
                <h1>{selectedProject.title}</h1>
              </div>
            </header>

            <p className="project-description">{selectedProject.description}</p>
            <p className="folder-name">projects/{selectedProject.folderName}</p>

            {error ? <p className="error-message">{error}</p> : null}

            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setModalMode("edit")}
                disabled={isSaving}
              >
                Изменить
              </button>
              <button className="ghost" type="button" onClick={handleDelete} disabled={isSaving}>
                Удалить
              </button>
            </div>

            <section className="images-section" aria-label="Изображения проекта">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Работа с изображениями</p>
                  <h2>Изображения</h2>
                </div>
                <div className="image-actions">
                  <input
                    ref={fileInputRef}
                    className="hidden-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadImages}
                  />
                  <button
                    className="primary"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving}
                  >
                    Добавить изображения
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setIsVideoModalOpen(true)}
                    disabled={isSaving}
                  >
                    Добавить видео
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={handleDeleteAllImages}
                    disabled={isSaving || images.length === 0}
                  >
                    Удалить все изображения
                  </button>
                </div>
              </div>

              {isImagesLoading ? <p className="side-note">Загрузка изображений...</p> : null}

              {!isImagesLoading && images.length === 0 ? (
                <p className="side-note">Изображений пока нет</p>
              ) : null}

              {visibleImages.length > 0 ? (
                <div className="image-grid">
                  {visibleImages.map((image) => (
                    <div className="image-tile" key={image.id}>
                      <button
                        className="image-thumb"
                        type="button"
                        onClick={() => setLightboxImage(image)}
                      >
                        <img src={mediaUrl(image.thumbnailUrl)} alt="" loading="lazy" />
                      </button>
                      <div className="image-menu-wrap">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label="Действия с изображением"
                          onClick={() =>
                            setOpenImageMenuId((current) =>
                              current === image.id ? null : image.id
                            )
                          }
                        >
                          ...
                        </button>
                        {openImageMenuId === image.id ? (
                          <div className="image-menu">
                            <button
                              type="button"
                              onClick={() => handleDeleteImage(image)}
                              disabled={isSaving}
                            >
                              Удалить
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {images.length > 4 ? (
                <button
                  className="link-button expand-button"
                  type="button"
                  onClick={() => setIsGalleryExpanded((current) => !current)}
                >
                  {isGalleryExpanded ? "Свернуть" : "Показать все"}
                </button>
              ) : null}
            </section>

            {images.length > 0 && colmapSettings ? (
              <section className="colmap-section" aria-label="COLMAP">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">COLMAP</p>
                    <h2>Реконструкция</h2>
                  </div>
                  <div className="image-actions">
                    <button
                      className="primary"
                      type="button"
                      onClick={handleStartColmap}
                      disabled={isColmapLoading || colmapJob?.status === "running"}
                    >
                      Запустить COLMAP
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => {
                        setIsLogsOpen(true);
                        setLogScrollTop(Math.max(0, colmapLogs.length * logRowHeight - logViewportHeight));
                      }}
                      disabled={colmapLogs.length === 0}
                    >
                      Показать логи
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setIsResultOpen(true)}
                      disabled={!resultPlyUrl || !colmapResult?.hasResult}
                    >
                      Посмотреть результат
                    </button>
                  </div>
                </div>

                <div className="colmap-grid">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={colmapSettings.useGpu}
                      onChange={(event) => updateColmapSetting("useGpu", event.target.checked)}
                      disabled={colmapJob?.status === "running"}
                    />
                    <span>Использовать GPU</span>
                  </label>

                  <label className="field">
                    <span>GPU index</span>
                    <input
                      value={colmapSettings.gpuIndex}
                      onChange={(event) => updateColmapSetting("gpuIndex", event.target.value)}
                      disabled={colmapJob?.status === "running" || !colmapSettings.useGpu}
                    />
                  </label>

                  <label className="field">
                    <span>Матчинг</span>
                    <select
                      value={colmapSettings.matcher}
                      onChange={(event) =>
                        updateColmapSetting("matcher", event.target.value as ColmapMatcher)
                      }
                      disabled={colmapJob?.status === "running"}
                    >
                      <option value="sequential">Последовательный</option>
                      <option value="exhaustive">Полный</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Перекрытие кадров</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={colmapSettings.sequentialOverlap}
                      onChange={(event) =>
                        updateColmapSetting("sequentialOverlap", Number(event.target.value))
                      }
                      disabled={colmapJob?.status === "running" || colmapSettings.matcher !== "sequential"}
                    />
                  </label>

                  <label className="field">
                    <span>Модель камеры</span>
                    <select
                      value={colmapSettings.cameraModel}
                      onChange={(event) => updateColmapSetting("cameraModel", event.target.value)}
                      disabled={colmapJob?.status === "running"}
                    >
                      <option>SIMPLE_RADIAL</option>
                      <option>PINHOLE</option>
                      <option>SIMPLE_PINHOLE</option>
                      <option>OPENCV</option>
                      <option>RADIAL</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Макс. размер изображения</span>
                    <input
                      type="number"
                      min="512"
                      max="10000"
                      step="128"
                      value={colmapSettings.maxImageSize}
                      onChange={(event) =>
                        updateColmapSetting("maxImageSize", Number(event.target.value))
                      }
                      disabled={colmapJob?.status === "running"}
                    />
                  </label>

                  <label className="field">
                    <span>Макс. признаков</span>
                    <input
                      type="number"
                      min="512"
                      max="65536"
                      step="512"
                      value={colmapSettings.maxNumFeatures}
                      onChange={(event) =>
                        updateColmapSetting("maxNumFeatures", Number(event.target.value))
                      }
                      disabled={colmapJob?.status === "running"}
                    />
                  </label>

                  <label className="field">
                    <span>Мин. matches для mapper</span>
                    <input
                      type="number"
                      min="4"
                      max="100"
                      step="1"
                      value={colmapSettings.mapperMinNumMatches}
                      onChange={(event) =>
                        updateColmapSetting("mapperMinNumMatches", Number(event.target.value))
                      }
                      disabled={colmapJob?.status === "running"}
                    />
                  </label>
                </div>

                <div className="colmap-toggles">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={colmapSettings.singleCamera}
                      onChange={(event) => updateColmapSetting("singleCamera", event.target.checked)}
                      disabled={colmapJob?.status === "running"}
                    />
                    <span>Одна камера для всех изображений</span>
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={colmapSettings.guidedMatching}
                      onChange={(event) => updateColmapSetting("guidedMatching", event.target.checked)}
                      disabled={colmapJob?.status === "running"}
                    />
                    <span>Guided matching</span>
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={colmapSettings.sequentialLoopDetection}
                      onChange={(event) =>
                        updateColmapSetting("sequentialLoopDetection", event.target.checked)
                      }
                      disabled={colmapJob?.status === "running" || colmapSettings.matcher !== "sequential"}
                    />
                    <span>Loop detection</span>
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={colmapSettings.mapperMultipleModels}
                      onChange={(event) =>
                        updateColmapSetting("mapperMultipleModels", event.target.checked)
                      }
                      disabled={colmapJob?.status === "running"}
                    />
                    <span>Несколько моделей</span>
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={colmapSettings.mapperExtractColors}
                      onChange={(event) =>
                        updateColmapSetting("mapperExtractColors", event.target.checked)
                      }
                      disabled={colmapJob?.status === "running"}
                    />
                    <span>Цвета точек</span>
                  </label>
                </div>

                {colmapJob ? (
                  <div className="pipeline">
                    {colmapJob.steps.map((step) => (
                      <div className={`pipeline-step ${step.status}`} key={step.id}>
                        <span className="step-dot" />
                        <span>{step.label}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {colmapJob?.status === "running" ? (
                  <div className="loader-row">
                    <span className="loader" aria-hidden="true" />
                    <span>COLMAP выполняется...</span>
                  </div>
                ) : null}

                {colmapJob?.status === "done" && colmapJob.output ? (
                  <p className="folder-name">colmap/points.ply</p>
                ) : null}

                {colmapJob?.status === "failed" && colmapJob.error ? (
                  <p className="error-message">{colmapJob.error}</p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : (
          <div className="empty-state">
            <p>{isLoading ? "Загрузка проектов..." : "Проектов пока нет"}</p>
            {error ? <p className="error-message">{error}</p> : null}
            <button className="primary" type="button" onClick={() => setModalMode("create")}>
              Создать проект
            </button>
          </div>
        )}
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={handleSubmitProject} aria-label="Проект">
            <header className="modal-header">
              <h2>{modalMode === "edit" ? "Изменить проект" : "Новый проект"}</h2>
            </header>

            <label className="field">
              <span>Название</span>
              <input name="title" autoFocus defaultValue={modalProject?.title ?? ""} required />
            </label>

            <label className="field">
              <span>Описание</span>
              <textarea
                name="description"
                defaultValue={modalProject?.description ?? ""}
                rows={4}
              />
            </label>

            {error ? <p className="error-message">{error}</p> : null}

            <div className="modal-actions">
              <button
                className="ghost"
                type="button"
                onClick={() => setModalMode(null)}
                disabled={isSaving}
              >
                Отмена
              </button>
              <button className="primary" type="submit" disabled={isSaving}>
                {modalMode === "edit" ? "Сохранить" : "Создать"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isVideoModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal video-modal" onSubmit={handleUploadVideo} aria-label="Загрузка видео">
            <header className="modal-header">
              <h2>Добавить видео</h2>
            </header>

            <label className="field">
              <span>Видео</span>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*,.mov,video/quicktime"
                onChange={handleVideoFileChange}
                required
              />
            </label>

            {videoMetadata ? (
              <div className="video-meta">
                <span>Длительность: {videoMetadata.duration.toFixed(2)} сек</span>
                <span>
                  Разрешение: {videoMetadata.width} x {videoMetadata.height}
                </span>
              </div>
            ) : (
              <p className="side-note">
                Если браузер не прочитал метаданные MOV, сервер обработает видео через ffmpeg.
              </p>
            )}

            <div className="settings-grid">
              <label className="field">
                <span>FPS</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  value={videoSettings.fps}
                  onChange={(event) => updateVideoSetting("fps", event.target.value)}
                  disabled={!videoFile}
                  required
                />
              </label>

              <label className="field">
                <span>Уменьшить на, %</span>
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  value={videoSettings.reductionPercent}
                  onChange={(event) => updateVideoSetting("reductionPercent", event.target.value)}
                  disabled={!videoFile}
                  required
                />
              </label>

              <label className="field">
                <span>Начать с, сек</span>
                <input
                  type="number"
                  min="0"
                  max={videoMetadata?.duration ?? undefined}
                  step="0.01"
                  value={videoSettings.startSecond}
                  onChange={(event) => updateVideoSetting("startSecond", event.target.value)}
                  disabled={!videoFile}
                  required
                />
              </label>

              <label className="field">
                <span>Закончить на, сек</span>
                <input
                  type="number"
                  min="0"
                  max={videoMetadata?.duration ?? undefined}
                  step="0.01"
                  value={videoSettings.endSecond}
                  onChange={(event) => updateVideoSetting("endSecond", event.target.value)}
                  disabled={!videoFile}
                />
              </label>
            </div>

            {isSaving ? (
              <div className="loader-row">
                <span className="loader" aria-hidden="true" />
                <span>Видео загружается и обрабатывается...</span>
              </div>
            ) : null}

            {error ? <p className="error-message">{error}</p> : null}

            <div className="modal-actions">
              <button className="ghost" type="button" onClick={closeVideoModal} disabled={isSaving}>
                Отмена
              </button>
              <button className="primary" type="submit" disabled={isSaving || !videoFile}>
                Загрузить
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isLogsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal logs-modal" aria-label="Логи COLMAP">
            <header className="modal-header logs-header">
              <h2>Логи COLMAP</h2>
              <button className="ghost" type="button" onClick={() => setIsLogsOpen(false)}>
                Закрыть
              </button>
            </header>
            <div
              ref={logViewportRef}
              className="log-viewport"
              onScroll={(event) => setLogScrollTop(event.currentTarget.scrollTop)}
            >
              <div style={{ height: colmapLogs.length * logRowHeight, position: "relative" }}>
                <div
                  className="log-lines"
                  style={{ transform: `translateY(${firstLogIndex * logRowHeight}px)` }}
                >
                  {visibleLogs.map((line, index) => (
                    <div className="log-line" key={`${firstLogIndex + index}-${line}`}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isResultOpen && resultPlyUrl && colmapResult ? (
        <div className="modal-backdrop result-backdrop" role="presentation">
          <div className="result-modal" aria-label="Результат COLMAP">
            <header className="result-toolbar">
              <h2>Результат COLMAP</h2>
              <button className="close-button" type="button" onClick={() => setIsResultOpen(false)}>
                Закрыть
              </button>
            </header>
            <Suspense
              fallback={
                <div className="point-viewer">
                  <div className="viewer-loading">Загрузка viewer...</div>
                </div>
              }
            >
              <PointCloudViewer plyUrl={resultPlyUrl} cameras={colmapResult.cameras} />
            </Suspense>
          </div>
        </div>
      ) : null}

      {lightboxImage ? (
        <div className="modal-backdrop image-backdrop" role="presentation">
          <div className="image-viewer">
            <div className="viewer-toolbar">
              <div className="image-menu-wrap">
                <button
                  className="icon-button visible"
                  type="button"
                  aria-label="Действия с изображением"
                  onClick={() => setIsLightboxMenuOpen((current) => !current)}
                >
                  ...
                </button>
                {isLightboxMenuOpen ? (
                  <div className="image-menu">
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(lightboxImage)}
                      disabled={isSaving}
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>
              <button className="close-button" type="button" onClick={() => setLightboxImage(null)}>
                Закрыть
              </button>
            </div>
            <img src={mediaUrl(lightboxImage.originalUrl)} alt="" />
          </div>
        </div>
      ) : null}
    </main>
  );
}
