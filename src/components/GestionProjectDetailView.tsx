"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { AdminProject, AdminProjectStatus } from "@/types/models";
import { formatDate } from "@/lib/format";
import { GestionTasksView } from "@/components/GestionTasksView";
import { PROJECT_COLORS, PROJECT_STATUS_LABEL, PROJECT_STATUS_STYLE } from "@/components/GestionProjectsView";
import { ArrowLeft, Pencil, Trash2, X } from "lucide-react";

export function GestionProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<AdminProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<AdminProject>(`/api/admin/projects/${projectId}`);
      setProject(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  // Rafraîchit juste la progression (taskCount/doneCount) sans repasser par
  // l'état "loading" — sinon le Kanban en dessous se démonterait et
  // réafficherait "Chargement..." à chaque ajout/déplacement de tâche.
  async function refreshStats() {
    try {
      const data = await apiFetch<AdminProject>(`/api/admin/projects/${projectId}`);
      setProject(data);
    } catch {
      // Best-effort : une tâche vient déjà d'être modifiée avec succès, ne
      // pas faire échouer cette action pour un simple rafraîchissement de
      // la barre de progression.
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function changeStatus(status: AdminProjectStatus) {
    if (!project) return;
    setProject({ ...project, status });
    await apiFetch(`/api/admin/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }

  async function handleDelete() {
    if (!project) return;
    if (!window.confirm(`Supprimer le projet « ${project.name} » ? Les tâches liées seront conservées, juste détachées du projet.`)) return;
    await apiFetch(`/api/admin/projects/${projectId}`, { method: "DELETE" });
    router.push("/gestion/projets");
  }

  if (loading) return <div className="px-4 md:px-10 pt-8 text-sm text-navy-100/50">Chargement...</div>;
  if (notFound || !project) {
    return (
      <div className="px-4 md:px-10 pt-8">
        <p className="text-sm text-navy-100/50">Projet introuvable.</p>
        <Link href="/gestion/projets" className="text-sm text-sunset-500 hover:underline">
          Retour aux projets
        </Link>
      </div>
    );
  }

  const pct = project.taskCount > 0 ? Math.round((project.doneCount / project.taskCount) * 100) : 0;

  return (
    <div>
      <div className="px-4 md:px-10 pt-8 pb-4">
        <Link href="/gestion/projets" className="flex items-center gap-1.5 text-xs text-navy-100/50 hover:text-cream-50 mb-3 w-fit">
          <ArrowLeft size={13} /> Projets
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-4 h-4 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: project.color }} />
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-cream-50 truncate">{project.name}</h1>
              {project.description && <p className="text-navy-100/50 text-sm mt-1 max-w-2xl">{project.description}</p>}
              {project.dueDate && <p className="text-navy-100/40 text-xs mt-1">Échéance : {formatDate(project.dueDate)}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={project.status}
              onChange={(e) => changeStatus(e.target.value as AdminProjectStatus)}
              className={clsx("input-dark w-auto text-xs py-1.5 font-semibold", PROJECT_STATUS_STYLE[project.status])}
            >
              {(Object.keys(PROJECT_STATUS_LABEL) as AdminProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button
              onClick={() => setEditing(true)}
              title="Modifier"
              className="rounded-lg border border-navy-700 text-navy-100/60 hover:text-cream-50 p-2 transition-colors"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={handleDelete}
              title="Supprimer le projet"
              className="rounded-lg border border-navy-700 text-navy-100/60 hover:text-red-400 hover:border-red-500/40 p-2 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {project.taskCount > 0 && (
          <div className="mt-4 max-w-md">
            <div className="flex items-center justify-between text-xs text-navy-100/50 mb-1">
              <span>
                {project.doneCount}/{project.taskCount} tâche{project.taskCount !== 1 ? "s" : ""} terminée
                {project.doneCount !== 1 ? "s" : ""}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: project.color }} />
            </div>
          </div>
        )}
      </div>

      <div className="px-4 md:px-10 pb-10">
        <GestionTasksView projectId={project.id} hideHeader onTasksChanged={refreshStats} />
      </div>

      {editing && (
        <EditProjectModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setProject(updated);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function EditProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: AdminProject;
  onClose: () => void;
  onSaved: (p: AdminProject) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState(project.color);
  const [dueDate, setDueDate] = useState(project.dueDate ? project.dueDate.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<AdminProject>(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description: description || null, color, dueDate: dueDate || null }),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700 sticky top-0 bg-navy-900">
          <h2 className="font-semibold text-cream-50">Modifier le projet</h2>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-dark" required autoFocus />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Description (optionnel)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-dark min-h-20" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Échéance (optionnel)</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-dark" />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Couleur</span>
            <div className="flex items-center gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={clsx("w-7 h-7 rounded-full transition-transform", color === c && "ring-2 ring-offset-2 ring-offset-navy-900 ring-cream-50 scale-110")}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm bg-red-500/15 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}
