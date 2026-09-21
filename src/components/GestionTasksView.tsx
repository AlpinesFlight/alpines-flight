"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { AdminTask, AdminTaskPriority } from "@/types/models";
import { formatDate } from "@/lib/format";
import { Plus, Trash2, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";

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

function isOverdue(task: AdminTask): boolean {
  if (!task.dueDate || task.done) return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function GestionTasksView() {
  const { data: session, status: sessionStatus } = useSession();
  const isGerant = session?.user?.role === "GERANT";
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (sessionStatus === "loading" || !isGerant) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, isGerant]);

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

  async function toggleDone(task: AdminTask) {
    await apiFetch(`/api/admin/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ done: !task.done }),
    });
    load();
  }

  async function handleDelete(task: AdminTask) {
    if (!window.confirm(`Supprimer la tâche « ${task.title} » ?`)) return;
    await apiFetch(`/api/admin/tasks/${task.id}`, { method: "DELETE" });
    load();
  }

  const { overdue, todo, done } = useMemo(() => {
    const active = tasks.filter((t) => !t.done);
    const sortFn = (a: AdminTask, b: AdminTask) => {
      const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pDiff !== 0) return pDiff;
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    };
    return {
      overdue: active.filter(isOverdue).sort(sortFn),
      todo: active.filter((t) => !isOverdue(t)).sort(sortFn),
      done: tasks.filter((t) => t.done).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    };
  }, [tasks]);

  if (sessionStatus !== "loading" && !isGerant) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 flex flex-col items-center text-center gap-2 max-w-md mx-auto mt-8">
          <ShieldAlert size={28} className="text-navy-400" />
          <p className="font-semibold text-navy-900">Accès réservé au Gérant</p>
          <p className="text-sm text-navy-600">La plateforme de gestion n&apos;est visible que du compte Gérant.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
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

      {overdue.length > 0 && (
        <TaskGroup title={`En retard (${overdue.length})`} titleClassName="text-red-600" tasks={overdue} onToggle={toggleDone} onDelete={handleDelete} />
      )}
      {todo.length > 0 && <TaskGroup title="À faire" tasks={todo} onToggle={toggleDone} onDelete={handleDelete} />}

      {done.length > 0 && (
        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden mt-5">
          <button
            onClick={() => setShowDone((s) => !s)}
            className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left"
          >
            <h2 className="font-semibold text-navy-900 flex items-center gap-1.5">
              {showDone ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Terminées ({done.length})
            </h2>
          </button>
          {showDone && (
            <div className="divide-y divide-navy-100 border-t border-navy-100">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} onToggle={() => toggleDone(t)} onDelete={() => handleDelete(t)} />
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
  onToggle,
  onDelete,
}: {
  title: string;
  titleClassName?: string;
  tasks: AdminTask[];
  onToggle: (t: AdminTask) => void;
  onDelete: (t: AdminTask) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-navy-100">
        <h2 className={clsx("font-semibold", titleClassName ?? "text-navy-900")}>{title}</h2>
      </div>
      <div className="divide-y divide-navy-100">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={() => onToggle(t)} onDelete={() => onDelete(t)} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }: { task: AdminTask; onToggle: () => void; onDelete: () => void }) {
  const overdue = isOverdue(task);
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <label className="flex items-center gap-3 min-w-0 cursor-pointer">
        <input type="checkbox" checked={task.done} onChange={onToggle} className="shrink-0 w-4 h-4 accent-sunset-500" />
        <div className="min-w-0">
          <p className={clsx("text-sm font-medium truncate", task.done ? "text-navy-400 line-through" : "text-navy-900")}>
            {task.title}
          </p>
          {task.description && <p className="text-xs text-navy-500 truncate">{task.description}</p>}
        </div>
      </label>
      <div className="flex items-center gap-2 shrink-0">
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
        {!task.done && (
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
