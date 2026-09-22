"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { AdminProjectLite, AdminTask, AdminTaskPriority, AdminTaskStatus } from "@/types/models";
import { formatDate } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import { Plus, Trash2, ChevronDown, ChevronRight, LayoutGrid, List, GripVertical } from "lucide-react";

const PRIORITY_LABEL: Record<AdminTaskPriority, string> = {
  LOW: "Basse",
  MEDIUM: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};
// Même langage de couleur que MaintenanceStatus (FleetView), adapté au fond
// sombre de /gestion : navy = neutre, sunset = attention, rouge = critique.
const PRIORITY_STYLE: Record<AdminTaskPriority, string> = {
  LOW: "bg-navy-800 text-navy-100/50",
  MEDIUM: "bg-navy-700 text-navy-100/80",
  HIGH: "bg-sunset-500/15 text-sunset-500",
  URGENT: "bg-red-500/15 text-red-400",
};
const PRIORITY_ORDER: Record<AdminTaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const COLUMNS: { key: AdminTaskStatus; label: string }[] = [
  { key: "TODO", label: "À faire" },
  { key: "DOING", label: "En cours" },
  { key: "DONE", label: "Terminé" },
];

function isOverdue(task: AdminTask): boolean {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

function sortTasks(a: AdminTask, b: AdminTask) {
  const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (pDiff !== 0) return pDiff;
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
}

// Réutilisé tel quel (même tableau Kanban, même filtre) par la page Tâches
// globale (pas de projectId) et par le détail d'un projet (projectId fixé,
// header masqué — le détail projet a le sien, plus riche, avec sa propre
// barre de progression : onTasksChanged la prévient de rafraîchir après
// tout ajout/déplacement/suppression ici, sinon elle resterait figée sur
// le taskCount/doneCount lus une seule fois à l'ouverture de la page). Le
// filtre par projet, lui, n'a de sens que côté global : dans un projet on
// est déjà implicitement filtré.
export function GestionTasksView({
  projectId,
  hideHeader,
  onTasksChanged,
}: {
  projectId?: string;
  hideHeader?: boolean;
  onTasksChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [projects, setProjects] = useState<AdminProjectLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [showDone, setShowDone] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>("ALL");

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<AdminTaskPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [newTaskProject, setNewTaskProject] = useState("");
  const [adding, setAdding] = useState(false);

  const effectiveProjectFilter = projectId ?? (projectFilter === "ALL" ? undefined : projectFilter);

  async function load() {
    setLoading(true);
    try {
      const qs = effectiveProjectFilter ? `?projectId=${encodeURIComponent(effectiveProjectFilter)}` : "";
      const data = await apiFetch<AdminTask[]>(`/api/admin/tasks${qs}`);
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveProjectFilter]);

  useEffect(() => {
    if (projectId) return; // page détail projet : pas besoin de la liste des projets
    apiFetch<AdminProjectLite[]>("/api/admin/projects")
      .then((data) => setProjects(data.map((p) => ({ id: p.id, name: p.name, color: p.color }))))
      .catch(() => {});
  }, [projectId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    try {
      await apiFetch("/api/admin/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          priority,
          dueDate: dueDate || null,
          projectId: projectId || newTaskProject || null,
        }),
      });
      setTitle("");
      setPriority("MEDIUM");
      setDueDate("");
      setNewTaskProject("");
      load();
      onTasksChanged?.();
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(task: AdminTask, status: AdminTaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    await apiFetch(`/api/admin/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
    onTasksChanged?.();
  }

  async function handleDelete(task: AdminTask) {
    if (!window.confirm(`Supprimer la tâche « ${task.title} » ?`)) return;
    await apiFetch(`/api/admin/tasks/${task.id}`, { method: "DELETE" });
    load();
    onTasksChanged?.();
  }

  const overdueCount = useMemo(() => tasks.filter(isOverdue).length, [tasks]);
  const showProjectBadge = !projectId;

  const content = (
    <div className={hideHeader ? "" : "px-4 md:px-10 pb-10"}>
      <form onSubmit={handleAdd} className="bg-navy-900 rounded-2xl border border-navy-700 p-3 flex flex-wrap items-center gap-2 mb-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nouvelle tâche..."
          className="input-dark flex-1 min-w-[180px]"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as AdminTaskPriority)} className="input-dark w-auto">
          {(Object.keys(PRIORITY_LABEL) as AdminTaskPriority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-dark w-auto" />
        {!projectId && projects.length > 0 && (
          <select value={newTaskProject} onChange={(e) => setNewTaskProject(e.target.value)} className="input-dark w-auto">
            <option value="">— Aucun projet —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={adding || !title.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors disabled:opacity-60"
        >
          <Plus size={16} /> Ajouter
        </button>
      </form>

      {!projectId && projects.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-navy-100/50">Projet :</span>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="input-dark w-auto text-xs py-1.5">
            <option value="ALL">Tous</option>
            <option value="none">Sans projet</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="bg-navy-900 rounded-2xl border border-navy-700 p-8 text-center text-sm text-navy-100/50">
          Aucune tâche pour l&apos;instant.
        </div>
      )}

      {overdueCount > 0 && (
        <p className="text-xs font-semibold text-red-400 mb-3">
          {overdueCount} tâche{overdueCount !== 1 ? "s" : ""} en retard
        </p>
      )}

      {tasks.length > 0 &&
        (view === "board" ? (
          <BoardView tasks={tasks} onSetStatus={setStatus} onDelete={handleDelete} showProjectBadge={showProjectBadge} />
        ) : (
          <ListView
            tasks={tasks}
            showDone={showDone}
            setShowDone={setShowDone}
            onSetStatus={setStatus}
            onDelete={handleDelete}
            showProjectBadge={showProjectBadge}
          />
        ))}
    </div>
  );

  const viewToggle = (
    <div className="flex items-center bg-navy-900 border border-navy-700 rounded-lg p-1 gap-1">
      <button
        onClick={() => setView("board")}
        className={clsx(
          "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors",
          view === "board" ? "bg-navy-700 text-cream-50" : "text-navy-100/60 hover:text-cream-50"
        )}
      >
        <LayoutGrid size={13} /> Tableau
      </button>
      <button
        onClick={() => setView("list")}
        className={clsx(
          "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors",
          view === "list" ? "bg-navy-700 text-cream-50" : "text-navy-100/60 hover:text-cream-50"
        )}
      >
        <List size={13} /> Liste
      </button>
    </div>
  );

  if (hideHeader) {
    return (
      <div>
        <div className="flex justify-end mb-3">{viewToggle}</div>
        {content}
      </div>
    );
  }

  return (
    <div>
      <GestionPageHeader title="Tâches" subtitle="Check-list interne — priorités et échéances" action={viewToggle} />
      {content}
    </div>
  );
}

function ProjectBadge({ project }: { project: AdminProjectLite }) {
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: `${project.color}26`, color: project.color }}
    >
      {project.name}
    </span>
  );
}

function BoardView({
  tasks,
  onSetStatus,
  onDelete,
  showProjectBadge,
}: {
  tasks: AdminTask[];
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: (t: AdminTask) => void;
  showProjectBadge: boolean;
}) {
  const [dragOverCol, setDragOverCol] = useState<AdminTaskStatus | null>(null);

  function handleDrop(e: React.DragEvent, status: AdminTaskStatus) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("text/plain");
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== status) onSetStatus(task, status);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.key).sort(sortTasks);
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(col.key);
            }}
            onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
            onDrop={(e) => handleDrop(e, col.key)}
            className={clsx(
              "rounded-2xl border p-2.5 min-h-[200px] transition-colors",
              dragOverCol === col.key ? "border-sunset-500 bg-sunset-500/10" : "border-navy-800 bg-navy-900/60"
            )}
          >
            <div className="flex items-center justify-between px-1.5 py-1 mb-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-navy-100/50">{col.label}</h2>
              <span className="text-[11px] font-semibold text-navy-100/40">{colTasks.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {colTasks.map((t) => (
                <TaskCard key={t.id} task={t} onSetStatus={onSetStatus} onDelete={onDelete} showProjectBadge={showProjectBadge} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  onSetStatus,
  onDelete,
  showProjectBadge,
}: {
  task: AdminTask;
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: (t: AdminTask) => void;
  showProjectBadge: boolean;
}) {
  const overdue = isOverdue(task);
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      className="bg-navy-800 rounded-xl border border-navy-700 p-3 cursor-grab active:cursor-grabbing hover:border-navy-600 transition-colors group"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={13} className="text-navy-100/30 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <p className={clsx("text-sm font-medium flex-1 min-w-0", task.status === "DONE" ? "text-navy-100/35 line-through" : "text-cream-50")}>
          {task.title}
        </p>
        <button onClick={() => onDelete(task)} title="Supprimer" className="text-navy-100/30 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 mt-2 pl-[18px]">
        {showProjectBadge && task.project && <ProjectBadge project={task.project} />}
        <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", PRIORITY_STYLE[task.priority])}>
          {PRIORITY_LABEL[task.priority]}
        </span>
        {task.dueDate && (
          <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", overdue ? "bg-red-500/15 text-red-400" : "bg-navy-700 text-navy-100/60")}>
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>
      {/* Repli tactile/accessible du glisser-déposer : déplace la carte
          d'une colonne sans avoir à faire un vrai drag (mobile, clavier). */}
      <div className="flex items-center gap-1 mt-2 pl-[18px]">
        {COLUMNS.filter((c) => c.key !== task.status).map((c) => (
          <button
            key={c.key}
            onClick={() => onSetStatus(task, c.key)}
            className="text-[10px] text-navy-100/40 hover:text-sunset-500 hover:underline"
          >
            → {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ListView({
  tasks,
  showDone,
  setShowDone,
  onSetStatus,
  onDelete,
  showProjectBadge,
}: {
  tasks: AdminTask[];
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: (t: AdminTask) => void;
  showProjectBadge: boolean;
}) {
  const overdue = tasks.filter((t) => isOverdue(t)).sort(sortTasks);
  const todo = tasks.filter((t) => t.status !== "DONE" && !isOverdue(t)).sort(sortTasks);
  const done = tasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div>
      {overdue.length > 0 && (
        <TaskGroup title={`En retard (${overdue.length})`} titleClassName="text-red-400" tasks={overdue} onSetStatus={onSetStatus} onDelete={onDelete} showProjectBadge={showProjectBadge} />
      )}
      {todo.length > 0 && (
        <TaskGroup title="À faire / en cours" tasks={todo} onSetStatus={onSetStatus} onDelete={onDelete} showProjectBadge={showProjectBadge} />
      )}

      {done.length > 0 && (
        <div className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden mt-5">
          <button onClick={() => setShowDone(!showDone)} className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left">
            <h2 className="font-semibold text-cream-50 flex items-center gap-1.5">
              {showDone ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Terminées ({done.length})
            </h2>
          </button>
          {showDone && (
            <div className="divide-y divide-navy-800 border-t border-navy-700">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} onSetStatus={onSetStatus} onDelete={() => onDelete(t)} showProjectBadge={showProjectBadge} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskGroup({
  title,
  titleClassName,
  tasks,
  onSetStatus,
  onDelete,
  showProjectBadge,
}: {
  title: string;
  titleClassName?: string;
  tasks: AdminTask[];
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: (t: AdminTask) => void;
  showProjectBadge: boolean;
}) {
  return (
    <div className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-navy-700">
        <h2 className={clsx("font-semibold", titleClassName ?? "text-cream-50")}>{title}</h2>
      </div>
      <div className="divide-y divide-navy-800">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onSetStatus={onSetStatus} onDelete={() => onDelete(t)} showProjectBadge={showProjectBadge} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onSetStatus,
  onDelete,
  showProjectBadge,
}: {
  task: AdminTask;
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: () => void;
  showProjectBadge: boolean;
}) {
  const overdue = isOverdue(task);
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <label className="flex items-center gap-3 min-w-0 cursor-pointer">
        <input
          type="checkbox"
          checked={task.status === "DONE"}
          onChange={() => onSetStatus(task, task.status === "DONE" ? "TODO" : "DONE")}
          className="shrink-0 w-4 h-4 accent-sunset-500"
        />
        <div className="min-w-0">
          <p className={clsx("text-sm font-medium truncate", task.status === "DONE" ? "text-navy-100/35 line-through" : "text-cream-50")}>
            {task.title}
          </p>
          {task.description && <p className="text-xs text-navy-100/45 truncate">{task.description}</p>}
        </div>
      </label>
      <div className="flex items-center gap-2 shrink-0">
        {showProjectBadge && task.project && <ProjectBadge project={task.project} />}
        {task.status === "DOING" && (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-sunset-500/15 text-sunset-500 whitespace-nowrap">En cours</span>
        )}
        {task.dueDate && (
          <span
            className={clsx(
              "text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap",
              overdue ? "bg-red-500/15 text-red-400" : "bg-navy-800 text-navy-100/50"
            )}
          >
            {formatDate(task.dueDate)}
          </span>
        )}
        {task.status !== "DONE" && (
          <span className={clsx("text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap", PRIORITY_STYLE[task.priority])}>
            {PRIORITY_LABEL[task.priority]}
          </span>
        )}
        <button onClick={onDelete} title="Supprimer" className="text-navy-100/40 hover:text-red-400">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
