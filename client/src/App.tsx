import { lazy, Suspense } from "react";
import {
  logRowHeight,
  useWorkspaceController,
} from "./app/useWorkspaceController";
import { ImageLightbox } from "./content/ImageLightbox";
import { ImageSection } from "./content/ImageSection";
import { VideoUploadModal } from "./content/VideoUploadModal";
import { LogModal } from "./logs/LogModal";
import { EmptyState } from "./projects/EmptyState";
import { ProjectModal } from "./projects/ProjectModal";
import { ProjectSidebar } from "./projects/ProjectSidebar";
import { ColmapSection } from "./reconstruction/ColmapSection";
import { GsplatSection } from "./reconstruction/GsplatSection";
import { ResultModal } from "./results/ResultModal";

const ColmapLivePreviewModal = lazy(() =>
  import("./reconstruction/ColmapLivePreviewModal").then((module) => ({
    default: module.ColmapLivePreviewModal,
  }))
);

export default function App() {
  const workspace = useWorkspaceController();

  return (
    <main className="workspace">
      <ProjectSidebar
        projects={workspace.projects}
        selectedId={workspace.selectedId}
        isLoading={workspace.isLoading}
        onCreate={() => workspace.setModalMode("create")}
        onSelect={workspace.setSelectedId}
      />

      <section className="details" aria-label="Детали проекта">
        {workspace.selectedProject ? (
          <div className="project-view">
            <header className="details-header">
              <div>
                <p className="eyebrow">Проект</p>
                <h1>{workspace.selectedProject.title}</h1>
              </div>
            </header>

            <p className="project-description">{workspace.selectedProject.description}</p>
            <p className="folder-name">projects/{workspace.selectedProject.folderName}</p>
            {workspace.error ? <p className="error-message">{workspace.error}</p> : null}

            <div className="actions">
              <button className="secondary" type="button" onClick={() => workspace.setModalMode("edit")} disabled={workspace.isSaving}>
                Изменить
              </button>
              <button className="ghost" type="button" onClick={workspace.handleDeleteProject} disabled={workspace.isSaving}>
                Удалить
              </button>
            </div>

            <ImageSection
              images={workspace.images}
              visibleImages={workspace.visibleImages}
              isImagesLoading={workspace.isImagesLoading}
              isSaving={workspace.isSaving}
              isGalleryExpanded={workspace.isGalleryExpanded}
              openImageMenuId={workspace.openImageMenuId}
              fileInputRef={workspace.fileInputRef}
              onUploadImages={workspace.handleUploadImages}
              onOpenVideoModal={() => workspace.setIsVideoModalOpen(true)}
              onDeleteAllImages={workspace.handleDeleteAllImages}
              onOpenImage={workspace.setLightboxImage}
              onToggleImageMenu={(imageId) =>
                workspace.setOpenImageMenuId((current) => (current === imageId ? null : imageId))
              }
              onDeleteImage={workspace.handleDeleteImage}
              onToggleGallery={() => workspace.setIsGalleryExpanded((current) => !current)}
            />

            {workspace.images.length > 0 && workspace.colmapSettings ? (
              <ColmapSection
                colmapJob={workspace.colmapJob}
                colmapLogsCount={workspace.colmapLogs.length}
                colmapResult={workspace.colmapResult}
                colmapSettings={workspace.colmapSettings}
                hasLivePly={Boolean(workspace.colmapLivePly)}
                isColmapLoading={workspace.isColmapLoading}
                resultPlyUrl={workspace.resultPlyUrl}
                onOpenLivePreview={() => workspace.setIsColmapPreviewOpen(true)}
                onOpenLogs={() => workspace.openLogs("colmap", workspace.colmapLogs.length)}
                onOpenResult={() => workspace.setResultMode("colmap")}
                onStart={workspace.handleStartColmap}
                onUpdateSetting={workspace.updateColmapSetting}
              />
            ) : null}

            {workspace.colmapResult?.hasResult && workspace.gsplatSettings ? (
              <GsplatSection
                canStartGsplat={Boolean(workspace.gsplatStatus?.available)}
                gsplatJob={workspace.gsplatJob}
                gsplatLogsCount={workspace.gsplatLogs.length}
                gsplatPlyUrl={workspace.gsplatPlyUrl}
                gsplatResult={workspace.gsplatResult}
                gsplatRuntimeElapsed={workspace.gsplatRuntimeElapsed}
                gsplatSettings={workspace.gsplatSettings}
                gsplatStatus={workspace.gsplatStatus}
                isGsplatLoading={workspace.isGsplatLoading}
                onOpenLogs={() => workspace.openLogs("gsplat", workspace.gsplatLogs.length)}
                onOpenResult={() => workspace.setResultMode("gsplat")}
                onStart={workspace.handleStartGsplat}
                onUpdateSetting={workspace.updateGsplatSetting}
              />
            ) : null}
          </div>
        ) : (
          <EmptyState
            isLoading={workspace.isLoading}
            error={workspace.error}
            onCreate={() => workspace.setModalMode("create")}
          />
        )}
      </section>

      {workspace.modalMode ? (
        <ProjectModal
          mode={workspace.modalMode}
          project={workspace.modalMode === "edit" ? workspace.selectedProject : null}
          error={workspace.error}
          isSaving={workspace.isSaving}
          onClose={() => workspace.setModalMode(null)}
          onSubmit={workspace.handleSubmitProject}
        />
      ) : null}

      {workspace.isVideoModalOpen ? (
        <VideoUploadModal
          error={workspace.error}
          isSaving={workspace.isSaving}
          videoFile={workspace.videoFile}
          videoInputRef={workspace.videoInputRef}
          videoMetadata={workspace.videoMetadata}
          videoSettings={workspace.videoSettings}
          onClose={workspace.closeVideoModal}
          onFileChange={workspace.handleVideoFileChange}
          onSubmit={workspace.handleUploadVideo}
          onUpdateSetting={(name, value) => workspace.setVideoSettings((current) => ({ ...current, [name]: value }))}
        />
      ) : null}

      {workspace.logMode ? (
        <LogModal
          firstLogIndex={workspace.firstLogIndex}
          logMode={workspace.logMode}
          logRowHeight={logRowHeight}
          logsLength={workspace.activeLogs.length}
          logViewportRef={workspace.logViewportRef}
          visibleLogs={workspace.visibleLogs}
          onClose={() => workspace.setLogMode(null)}
          onScroll={workspace.setLogScrollTop}
        />
      ) : null}

      {workspace.resultMode && workspace.activeResultPlyUrl ? (
        <ResultModal
          colmapResult={workspace.colmapResult}
          gsplatResult={workspace.gsplatResult}
          images={workspace.images}
          plyUrl={workspace.activeResultPlyUrl}
          resultMode={workspace.resultMode}
          title={workspace.activeResultTitle}
          onClose={() => workspace.setResultMode(null)}
        />
      ) : null}

      {workspace.isColmapPreviewOpen && workspace.colmapJob ? (
        <Suspense fallback={null}>
          <ColmapLivePreviewModal
            images={workspace.images}
            livePly={workspace.colmapLivePly}
            plyUrl={workspace.colmapLivePlyUrl}
            onClose={() => workspace.setIsColmapPreviewOpen(false)}
          />
        </Suspense>
      ) : null}

      {workspace.lightboxImage ? (
        <ImageLightbox
          image={workspace.lightboxImage}
          isMenuOpen={workspace.isLightboxMenuOpen}
          isSaving={workspace.isSaving}
          onClose={() => workspace.setLightboxImage(null)}
          onDelete={workspace.handleDeleteImage}
          onToggleMenu={() => workspace.setIsLightboxMenuOpen((current) => !current)}
        />
      ) : null}
    </main>
  );
}
