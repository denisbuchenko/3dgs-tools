import { FormEvent, useMemo, useState } from "react";

type Project = {
  id: number;
  title: string;
  description: string;
  updatedAt: string;
};

const initialProjects: Project[] = [
  {
    id: 1,
    title: "Gaussian viewer",
    description: "Просмотр и быстрая проверка сцен перед экспортом.",
    updatedAt: "15 Jun",
  },
  {
    id: 2,
    title: "Training presets",
    description: "Набор стартовых настроек для экспериментов.",
    updatedAt: "12 Jun",
  },
];

function createProject(id: number, title: string, description: string): Project {
  return {
    id,
    title,
    description: description || "Описание пока не заполнено.",
    updatedAt: "сейчас",
  };
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedId, setSelectedId] = useState(initialProjects[0]?.id ?? 0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId]
  );

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();

    if (!title) {
      return;
    }

    const nextId = Math.max(0, ...projects.map((project) => project.id)) + 1;
    const nextProject = createProject(nextId, title, description);

    setProjects((current) => [nextProject, ...current]);
    setSelectedId(nextProject.id);
    setIsCreateOpen(false);
    event.currentTarget.reset();
  }

  function handleDelete() {
    if (!selectedProject) {
      return;
    }

    const remaining = projects.filter((project) => project.id !== selectedProject.id);
    setProjects(remaining);
    setSelectedId(remaining[0]?.id ?? 0);
  }

  return (
    <main className="workspace">
      <aside className="sidebar" aria-label="Проекты">
        <button className="create-button" type="button" onClick={() => setIsCreateOpen(true)}>
          <span aria-hidden="true">+</span>
          <span>Создать проект</span>
        </button>

        <div className="project-list">
          {projects.map((project) => (
            <button
              className={project.id === selectedId ? "project-item active" : "project-item"}
              key={project.id}
              type="button"
              onClick={() => setSelectedId(project.id)}
            >
              <span className="project-title">{project.title}</span>
              <span className="project-meta">{project.updatedAt}</span>
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

            <div className="actions">
              <button className="ghost" type="button" onClick={handleDelete}>
                Удалить
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>Проектов пока нет</p>
            <button className="primary" type="button" onClick={() => setIsCreateOpen(true)}>
              Создать проект
            </button>
          </div>
        )}
      </section>

      {isCreateOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={handleCreate} aria-label="Создание проекта">
            <header className="modal-header">
              <h2>Новый проект</h2>
            </header>

            <label className="field">
              <span>Название</span>
              <input name="title" autoFocus required />
            </label>

            <label className="field">
              <span>Описание</span>
              <textarea name="description" rows={4} />
            </label>

            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setIsCreateOpen(false)}>
                Отмена
              </button>
              <button className="primary" type="submit">
                Создать
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
