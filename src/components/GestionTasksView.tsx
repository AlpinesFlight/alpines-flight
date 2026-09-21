"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { AdminTask, AdminTaskPriority, AdminTaskStatus } from "@/types/models";
import { formatDate } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import { Plus, Trash2, ChevronDown, ChevronRight, LayoutGrid, List, GripVertical } from "lucide-react";

const PRIORITY_LABEL: Record<AdminTaskPriority, string> = {
  LOW: "Basse",
  MEDIUM: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};
// Même langage de couleur que MaintenanceStatus (FleetView) : navy = neutre,
// sunset = attention, rouge = critique.
const PRIORITY_STYLE: Record<AdminTaskPriority, string> = {
  LOW: "bg-navy-50 text-navy-500",
  MEDIUM: "bg-navy-100 text-navy-800",
  HIGH: "bg-sunset-100 text-sunset-600",
  URGENT: "bg-red-100 text-red-600",
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

export function GestionTasksView() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [showDone, setShowDone] = useState(false);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<AdminTaskPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<AdminTask[]>("/api/admin/tasks");
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    try {
      await apiFetch("/api/admin/tasks", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), priority, dueDate: dueDate || null }),
      });
      setTitle("");
      setPriority("MEDIUM");
      setDueDate("");
      load();
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(task: AdminTask, status: AdminTaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    await apiFetch(`/api/admin/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  }

  async function handleDelete(task: AdminTask) {
    if (!window.confirm(`Supprimer la tâche « ${task.title} » ?`)) return;
    await apiFetch(`/api/admin/tasks/${task.id}`, { method: "DELETE" });
    load();
  }

  const overdueCount = useMemo(() => tasks.filter(isOverdue).length, [tasks]);

  return (
    <div>
      <GestionPageHeader
        title="Tâches"
        subtitle="Check-list interne — priorités et échéances"
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-navy-50 rounded-lg p-1 gap-1">
              <button
                onClick={() => setView("board")}
                className={clsx(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors",
                  view === "board" ? "bg-white text-navy-900 shadow-sm" : "text-navy-600 hover:text-navy-900"
                )}
              >
                <LayoutGrid size={13} /> Tableau
              </button>
              <button
                onClick={() => setView("list")}
                className={clsx(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors",
                  view === "list" ? "bg-white text-navy-900 shadow-sm" : "text-navy-600 hover:text-navy-900"
                )}
              >
                <List size={13} /> Liste
              </button>
            </div>
          </div>
        }
      />
      <div className="px-4 md:px-10 pb-10">
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-navy-100 p-3 flex flex-wrap items-center gap-2 mb-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nouvelle tâche..."
            className="input flex-1 min-w-[180px]"
          />
          <select value={priority} onChange={(e) => setPriority(e.target.value as AdminTaskPriority)} className="input w-auto">
            {(Object.keys(PRIORITY_LABEL) as AdminTaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input w-auto" />
          <button
            type="submit"
            disabled={adding || !title.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors disabled:opacity-60"
          >
            <Plus size={16} /> Ajouter
          </button>
        </form>

        {!loading && tasks.length === 0 && (
          <div className="bg-white rounded-2xl border border-navy-100 p-8 text-center text-sm text-navy-600">
            Aucune tâche pour l&apos;instant.
          </div>
        )}

        {overdueCount > 0 && (
          <p className="text-xs font-semibold text-red-600 mb-3">
            {overdueCount} tâche{overdueCount !== 1 ? "s" : ""} en retard
          </p>
        )}

        {tasks.length > 0 &&
          (view === "board" ? (
            <BoardView tasks={tasks} onSetStatus={setStatus} onDelete={handleDelete} />
          ) : (
            <ListView tasks={tasks} showDone={showDone} setShowDone={setShowDone} onSetStatus={setStatus} onDelete={handleDelete} />
          ))}
      </div>
    </div>
  );
}

function BoardView({
  tasks,
  onSetStatus,
  onDelete,
}: {
  tasks: AdminTask[];
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: (t: AdminTask) => void;
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
              dragOverCol === col.key ? "border-sunset-400 bg-sunset-50" : "border-navy-100 bg-navy-50/40"
            )}
          >
            <div className="flex items-center justify-between px-1.5 py-1 mb-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-navy-600">{col.label}</h2>
              <span className="text-[11px] font-semibold text-navy-400">{colTasks.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {colTasks.map((t) => (
                <TaskCard key={t.id} task={t} onSetStatus={onSetStatus} onDelete={onDelete} />
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
}: {
  task: AdminTask;
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: (t: AdminTask) => void;
}) {
  const overdue = isOverdue(task);
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      className="bg-white rounded-xl border border-navy-100 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={13} className="text-navy-300 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <p className={clsx("text-sm font-medium flex-1 min-w-0", task.status === "DONE" ? "text-navy-400 line-through" : "text-navy-900")}>
          {task.title}
        </p>
        <button onClick={() => onDelete(task)} title="Supprimer" className="text-navy-300 hover:text-red-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 mt-2 pl-[18px]">
        <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", PRIORITY_STYLE[task.priority])}>
          {PRIORITY_LABEL[task.priority]}
        </span>
        {task.dueDate && (
          <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", overdue ? "bg-red-100 text-red-600" : "bg-navy-100 text-navy-500")}>
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
            className="text-[10px] text-navy-400 hover:text-sunset-600 hover:underline"
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
}: {
  tasks: AdminTask[];
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: (t: AdminTask) => void;
}) {
  const overdue = tasks.filter((t) => isOverdue(t)).sort(sortTasks);
  const todo = tasks.filter((t) => t.status !== "DONE" && !isOverdue(t)).sort(sortTasks);
  const done = tasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div>
      {overdue.length > 0 && (
        <TaskGroup title={`En retard (${overdue.length})`} titleClassName="text-red-600" tasks={overdue} onSetStatus={onSetStatus} onDelete={onDelete} />
      )}
      {todo.length > 0 && <TaskGroup title="À faire / en cours" tasks={todo} onSetStatus={onSetStatus} onDelete={onDelete} />}

      {done.length > 0 && (
        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden mt-5">
          <button onClick={() => setShowDone(!showDone)} className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left">
            <h2 className="font-semibold text-navy-900 flex items-center gap-1.5">
              {showDone ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Terminées ({done.length})
            </h2>
          </button>
          {showDone && (
            <div className="divide-y divide-navy-100 border-t border-navy-100">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} onSetStatus={onSetStatus} onDelete={() => onDelete(t)} />
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
}: {
  title: string;
  titleClassName?: string;
  tasks: AdminTask[];
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: (t: AdminTask) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-navy-100">
        <h2 className={clsx("font-semibold", titleClassName ?? "text-navy-900")}>{title}</h2>
      </div>
      <div className="divide-y divide-navy-100">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onSetStatus={onSetStatus} onDelete={() => onDelete(t)} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onSetStatus,
  onDelete,
}: {
  task: AdminTask;
  onSetStatus: (t: AdminTask, s: AdminTaskStatus) => void;
  onDelete: () => void;
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
          <p className={clsx("text-sm font-medium truncate", task.status === "DONE" ? "text-navy-400 line-through" : "text-navy-900")}>
            {task.title}
          </p>
          {task.description && <p className="text-xs text-navy-500 truncate">{task.description}</p>}
        </div>
      </label>
      <div className="flex items-center gap-2 shrink-0">
        {task.status === "DOING" && (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-sunset-100 text-sunset-600 whitespace-nowrap">En cours</span>
        )}
        {task.dueDate && (
          <span
            className={clsx(
              "text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap",
              overdue ? "bg-red-100 text-red-600" : "bg-navy-50 text-navy-500"
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
        <button onClick={onDelete} title="Supprimer" className="text-navy-400 hover:text-red-600">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
