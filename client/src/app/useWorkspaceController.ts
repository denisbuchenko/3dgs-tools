import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProject,
  deleteAllProjectImages,
  deleteProject,
  deleteProjectImage,
  requestColmapDefaults,
  requestColmapJob,
  requestColmapResult,
  requestGsplatDefaults,
  requestGsplatJob,
  requestGsplatResult,
  requestGsplatStatus,
  requestProjectImages,
  requestProjects,
  startColmap,
  startGsplat,
  updateProject,
  uploadProjectImages,
  uploadProjectVideo,
} from "../api/client";
import { defaultVideoSettings, emptyVideoSettings } from "../content/videoSettings";
import type {
  ColmapSettings,
  GsplatSettings,
  GsplatTrainerStatus,
  LogMode,
  Project,
  ProjectImage,
  ResultMode,
  VideoMetadata,
  VideoSettings,
} from "../types";
import { formatElapsedTime } from "../utils/date";
import { mediaUrl } from "../utils/media";
import {
  errorMessage,
  isVideoRangeValid,
  pollJob,
  readVideoMetadata,
} from "./workspaceHelpers";

export const logRowHeight = 22;
export const logViewportHeight = 420;

export function useWorkspaceController() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>(emptyVideoSettings);
  const [colmapSettings, setColmapSettings] = useState<ColmapSettings | null>(null);
  const [colmapJob, setColmapJob] = useState<Awaited<ReturnType<typeof requestColmapJob>> | null>(null);
  const [colmapResult, setColmapResult] = useState<Awaited<ReturnType<typeof requestColmapResult>> | null>(null);
  const [gsplatSettings, setGsplatSettings] = useState<GsplatSettings | null>(null);
  const [gsplatJob, setGsplatJob] = useState<Awaited<ReturnType<typeof requestGsplatJob>> | null>(null);
  const [gsplatResult, setGsplatResult] = useState<Awaited<ReturnType<typeof requestGsplatResult>> | null>(null);
  const [gsplatStatus, setGsplatStatus] = useState<GsplatTrainerStatus | null>(null);
  const [resultMode, setResultMode] = useState<ResultMode | null>(null);
  const [isColmapLoading, setIsColmapLoading] = useState(false);
  const [isGsplatLoading, setIsGsplatLoading] = useState(false);
  const [logMode, setLogMode] = useState<LogMode | null>(null);
  const [logScrollTop, setLogScrollTop] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<ProjectImage | null>(null);
  const [openImageMenuId, setOpenImageMenuId] = useState<string | null>(null);
  const [isLightboxMenuOpen, setIsLightboxMenuOpen] = useState(false);
  const [isGalleryExpanded, setIsGalleryExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImagesLoading, setIsImagesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const logViewportRef = useRef<HTMLDivElement>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId]
  );
  const colmapLogs = colmapJob?.logs ?? [];
  const gsplatLogs = gsplatJob?.logs ?? [];
  const activeLogs = logMode === "gsplat" ? gsplatLogs : colmapLogs;
  const firstLogIndex = Math.max(0, Math.floor(logScrollTop / logRowHeight) - 8);
  const visibleLogCount = Math.ceil(logViewportHeight / logRowHeight) + 16;
  const visibleLogs = activeLogs.slice(firstLogIndex, firstLogIndex + visibleLogCount);
  const visibleImages = isGalleryExpanded ? images : images.slice(0, 4);
  const resultPlyUrl = colmapResult?.plyUrl ? mediaUrl(colmapResult.plyUrl) : null;
  const gsplatPlyUrl = gsplatResult?.plyUrl ? mediaUrl(gsplatResult.plyUrl) : null;
  const activeResultPlyUrl = resultMode === "gsplat" ? gsplatPlyUrl : resultPlyUrl;
  const activeResultTitle = resultMode === "gsplat" ? "Результат gsplat" : "Результат COLMAP";
  const gsplatRuntimeElapsed =
    gsplatStatus?.startedAt && !gsplatStatus.available
      ? formatElapsedTime(gsplatStatus.startedAt, nowMs)
      : null;

  useEffect(() => {
    requestProjects()
      .then((loadedProjects) => {
        setProjects(loadedProjects);
        setSelectedId(loadedProjects[0]?.id ?? null);
      })
      .catch((requestError: unknown) => setError(errorMessage(requestError, "Ошибка загрузки.")))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setImages([]);
      return;
    }

    resetSelectedProjectState();
    setIsImagesLoading(true);

    requestProjectImages(selectedId)
      .then(setImages)
      .catch((requestError: unknown) => setError(errorMessage(requestError, "Ошибка загрузки изображений.")))
      .finally(() => setIsImagesLoading(false));
    requestColmapDefaults(selectedId).then(setColmapSettings).catch((error) => setError(errorMessage(error, "Ошибка загрузки COLMAP.")));
    requestColmapJob(selectedId).then(setColmapJob).catch(() => undefined);
    requestColmapResult(selectedId).then(setColmapResult).catch(() => undefined);
    requestGsplatDefaults(selectedId).then(setGsplatSettings).catch((error) => setError(errorMessage(error, "Ошибка загрузки gsplat.")));
    requestGsplatJob(selectedId).then(setGsplatJob).catch(() => undefined);
    requestGsplatStatus(selectedId).then(setGsplatStatus).catch(() => undefined);
    requestGsplatResult(selectedId).then(setGsplatResult).catch(() => undefined);
  }, [selectedId]);

  useEffect(() => pollJob(selectedId, colmapJob?.status, requestColmapJob, setColmapJob, "Ошибка статуса COLMAP."), [colmapJob?.status, selectedId]);
  useEffect(() => pollJob(selectedId, gsplatJob?.status, requestGsplatJob, setGsplatJob, "Ошибка статуса gsplat."), [gsplatJob?.status, selectedId]);

  useEffect(() => {
    if (!selectedId || !gsplatStatus || gsplatStatus.available) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      requestGsplatStatus(selectedId).then(setGsplatStatus).catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [gsplatStatus?.available, selectedId]);

  useEffect(() => {
    if (!gsplatStatus?.startedAt || gsplatStatus.available) {
      return undefined;
    }

    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [gsplatStatus?.available, gsplatStatus?.startedAt]);

  useEffect(() => {
    if (!logMode || !logViewportRef.current) {
      return;
    }

    const nextScrollTop = Math.max(0, activeLogs.length * logRowHeight - logViewportHeight);
    logViewportRef.current.scrollTop = nextScrollTop;
    setLogScrollTop(nextScrollTop);
  }, [logMode, activeLogs.length]);

  useEffect(() => {
    if (selectedId && colmapJob?.status === "done") {
      requestColmapResult(selectedId).then(setColmapResult).catch(() => undefined);
    }
  }, [colmapJob?.status, selectedId]);

  useEffect(() => {
    if (selectedId && gsplatJob?.status === "done") {
      requestGsplatResult(selectedId).then(setGsplatResult).catch(() => undefined);
    }
  }, [gsplatJob?.status, selectedId]);

  function resetSelectedProjectState() {
    setIsGalleryExpanded(false);
    setLightboxImage(null);
    setOpenImageMenuId(null);
    setIsLightboxMenuOpen(false);
    setIsVideoModalOpen(false);
    setColmapSettings(null);
    setColmapJob(null);
    setColmapResult(null);
    setGsplatSettings(null);
    setGsplatJob(null);
    setGsplatResult(null);
    setGsplatStatus(null);
    setResultMode(null);
    setLogMode(null);
  }

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

    await withSaving(async () => {
      if (modalMode === "edit" && selectedProject) {
        const updatedProject = await updateProject(selectedProject.id, payload);
        setProjects((current) => current.map((project) => (project.id === updatedProject.id ? updatedProject : project)));
        setSelectedId(updatedProject.id);
      } else {
        const newProject = await createProject(payload);
        setProjects((current) => [newProject, ...current]);
        setSelectedId(newProject.id);
      }

      setModalMode(null);
      event.currentTarget.reset();
    }, "Ошибка сохранения.");
  }

  async function handleDeleteProject() {
    if (!selectedProject) {
      return;
    }

    await withSaving(async () => {
      await deleteProject(selectedProject.id);
      const remaining = projects.filter((project) => project.id !== selectedProject.id);
      setProjects(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    }, "Ошибка удаления.");
  }

  async function handleUploadImages(event: ChangeEvent<HTMLInputElement>) {
    if (!selectedProject || !event.target.files?.length) {
      return;
    }

    await withSaving(async () => {
      const uploadedImages = await uploadProjectImages(selectedProject.id, event.target.files!);
      setImages(uploadedImages);
      clearImageOverlays();
      touchSelectedProject();
    }, "Ошибка загрузки изображений.");
    event.target.value = "";
  }

  function handleVideoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setVideoFile(file);
    setVideoMetadata(null);
    setVideoSettings(file ? defaultVideoSettings : emptyVideoSettings);
    setError("");

    if (file) {
      readVideoMetadata(file, setVideoMetadata, setVideoSettings, setError);
    }
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProject || !videoFile || !isVideoRangeValid(videoSettings, videoMetadata)) {
      setError(videoMetadata ? "Проверьте диапазон секунд: он должен быть внутри длительности видео." : "Проверьте диапазон секунд: конец должен быть больше начала.");
      return;
    }

    await withSaving(async () => {
      const uploadedImages = await uploadProjectVideo(selectedProject.id, videoFile, videoSettings);
      setImages(uploadedImages);
      clearImageOverlays();
      touchSelectedProject();
      closeVideoModal();
    }, "Ошибка обработки видео.");
  }

  async function handleDeleteImage(image: ProjectImage) {
    if (!selectedProject) {
      return;
    }

    await withSaving(async () => {
      await deleteProjectImage(selectedProject.id, image.id);
      setImages((current) => current.filter((item) => item.id !== image.id));
      setOpenImageMenuId(null);

      if (lightboxImage?.id === image.id) {
        setLightboxImage(null);
        setIsLightboxMenuOpen(false);
      }
    }, "Ошибка удаления изображения.");
  }

  async function handleDeleteAllImages() {
    if (!selectedProject || images.length === 0) {
      return;
    }

    await withSaving(async () => {
      await deleteAllProjectImages(selectedProject.id);
      setImages([]);
      clearImageOverlays();
    }, "Ошибка удаления изображений.");
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
      setError(errorMessage(requestError, "Ошибка запуска COLMAP."));
    } finally {
      setIsColmapLoading(false);
    }
  }

  async function handleStartGsplat() {
    if (!selectedProject || !gsplatSettings || !colmapResult?.hasResult) {
      return;
    }

    setIsGsplatLoading(true);
    setError("");

    try {
      const status = await requestGsplatStatus(selectedProject.id);
      setGsplatStatus(status);

      if (!status.available) {
        setError(status.message);
        return;
      }

      const job = await startGsplat(selectedProject.id, gsplatSettings);
      setGsplatJob(job);
      setGsplatResult(null);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, "Ошибка запуска gsplat."));
    } finally {
      setIsGsplatLoading(false);
    }
  }

  function updateColmapSetting<Key extends keyof ColmapSettings>(key: Key, value: ColmapSettings[Key]) {
    setColmapSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateGsplatSetting<Key extends keyof GsplatSettings>(key: Key, value: GsplatSettings[Key]) {
    setGsplatSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function withSaving(action: () => Promise<void>, fallbackMessage: string) {
    setIsSaving(true);
    setError("");

    try {
      await action();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, fallbackMessage));
    } finally {
      setIsSaving(false);
    }
  }

  function closeVideoModal() {
    setIsVideoModalOpen(false);
    setVideoFile(null);
    setVideoMetadata(null);
    setVideoSettings(emptyVideoSettings);

    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
  }

  function clearImageOverlays() {
    setLightboxImage(null);
    setOpenImageMenuId(null);
    setIsLightboxMenuOpen(false);
  }

  function touchSelectedProject() {
    if (!selectedProject) {
      return;
    }

    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProject.id ? { ...project, updatedAt: new Date().toISOString() } : project
      )
    );
  }

  function openLogs(mode: LogMode, logsCount: number) {
    setLogMode(mode);
    setLogScrollTop(Math.max(0, logsCount * logRowHeight - logViewportHeight));
  }

  return {
    projects, selectedId, selectedProject, images, visibleImages,
    isLoading, isImagesLoading, isSaving, error,
    modalMode, isVideoModalOpen, videoFile, videoMetadata, videoSettings,
    colmapSettings, colmapJob, colmapResult, colmapLogs, resultPlyUrl,
    gsplatSettings, gsplatJob, gsplatResult, gsplatStatus, gsplatLogs, gsplatPlyUrl,
    gsplatRuntimeElapsed, isColmapLoading, isGsplatLoading,
    resultMode, activeResultPlyUrl, activeResultTitle,
    logMode, activeLogs, firstLogIndex, visibleLogs,
    lightboxImage, openImageMenuId, isLightboxMenuOpen, isGalleryExpanded,
    fileInputRef, videoInputRef, logViewportRef,
    setSelectedId, setModalMode, setIsVideoModalOpen, setVideoSettings,
    setLogMode, setLogScrollTop, setResultMode, setLightboxImage,
    setOpenImageMenuId, setIsLightboxMenuOpen, setIsGalleryExpanded,
    handleSubmitProject, handleDeleteProject, handleUploadImages, handleVideoFileChange,
    handleUploadVideo, handleDeleteImage, handleDeleteAllImages,
    handleStartColmap, handleStartGsplat,
    updateColmapSetting, updateGsplatSetting, closeVideoModal, openLogs,
  };
}
