"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { AdminProject, AdminProjectStatus } from "@/types/models";
import { formatDate } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import { Plus, X, FolderKanban } from "lucide-react";

export const PROJECT_COLORS = ["#f04818", "#2c8fd6", "#8b5cf6", "#22b07a", "#d33d10", "#e0a418", "#64748b"];

export const PROJECT_STATUS_LABEL: Record<AdminProjectStatus, string> = {
  ACTIVE: "Actif",
  ON_HOLD: "En pause",
  COMPLETED: "Terminé",
  ARCHIVED: "Archivé",
};
export const PROJECT_STATUS_STYLE: Record<AdminProjectStatus, string> = {
  ACTIVE: "bg-green-500/15 text-green-400",
  ON_HOLD: "bg-sunset-500/15 text-sunset-500",
  COMPLETED: "bg-navy-700 text-navy-100/70",
  ARCHIVED: "bg-navy-800 text-navy-100/40",
};

export function GestionProjectsView() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<AdminProject[]>("/api/admin/projects");
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = projects.filter((p) => showArchived || p.status !== "ARCHIVED");
  const archivedCount = projects.length - projects.filter((p) => p.status !== "ARCHIVED").length;

  return (
    <div>
      <GestionPageHeader
        title="Projets"
        subtitle="Regroupe des tâches sous un même objectif"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Nouveau projet
          </button>
        }
      />
      <div className="px-4 md:px-10 pb-10">
        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived((s) => !s)}
            className="text-xs font-semibold text-navy-100/50 hover:text-cream-50 bg-navy-900 border border-navy-700 hover:bg-navy-800 px-3 py-1.5 rounded-full transition-colors mb-4"
          >
            {showArchived ? "Masquer les projets archivés" : `Afficher les projets archivés (${archivedCount})`}
          </button>
        )}

        {!loading && visible.length === 0 && (
          <div className="bg-navy-900 rounded-2xl border border-navy-700 p-8 text-center text-sm text-navy-100/50">
            Aucun projet pour l&apos;instant. Crée-en un pour regrouper des tâches sous un même objectif.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: AdminProject }) {
  const pct = project.taskCount > 0 ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
  return (
    <Link
      href={`/gestion/projets/${project.id}`}
      className="bg-navy-900 rounded-2xl border border-navy-700 p-4 hover:border-sunset-500/50 transition-colors flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
          <p className="text-sm font-semibold text-cream-50 truncate">{project.name}</p>
        </div>
        <span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", PROJECT_STATUS_STYLE[project.status])}>
          {PROJECT_STATUS_LABEL[project.status]}
        </span>
      </div>
      {project.description && <p className="text-xs text-navy-100/50 line-clamp-2">{project.description}</p>}
      <div>
        <div className="flex items-center justify-between text-[11px] text-navy-100/40 mb-1">
          <span>
            {project.doneCount}/{project.taskCount} tâche{project.taskCount !== 1 ? "s" : ""}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-navy-800 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: project.color }} />
        </div>
      </div>
      {project.dueDate && <p className="text-[11px] text-navy-100/40">Échéance : {formatDate(project.dueDate)}</p>}
    </Link>
  );
}

function CreateProjectModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify({ name, description: description || null, color, dueDate: dueDate || null }),
      });
      onSaved();
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
          <h2 className="font-semibold text-cream-50 flex items-center gap-2">
            <FolderKanban size={16} className="text-sunset-500" /> Nouveau projet
          </h2>
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
            {saving ? "Création..." : "Créer le projet"}
          </button>
        </form>
      </div>
    </div>
  );
}
