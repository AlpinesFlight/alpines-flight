"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { AdminDocument, AdminEvent, AdminTask } from "@/types/models";
import { formatDate, formatDateTime } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import { Inbox, ListChecks, CalendarClock, StickyNote, Contact2, Video, ArrowRight } from "lucide-react";

function isOverdue(task: AdminTask, now: number): boolean {
  return !!task.dueDate && task.status !== "DONE" && new Date(task.dueDate).getTime() < now;
}

export function GestionDashboardView() {
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // Capturé au chargement plutôt que lu pendant le rendu (Date.now() est impur).
  const [now] = useState(() => Date.now());

  useEffect(() => {
    Promise.all([
      apiFetch<AdminDocument[]>("/api/admin/documents"),
      apiFetch<AdminTask[]>("/api/admin/tasks"),
      apiFetch<AdminEvent[]>("/api/admin/events"),
    ])
      .then(([d, t, e]) => {
        setDocuments(d);
        setTasks(t);
        setEvents(e);
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingDocs = documents.filter((d) => d.status === "PENDING");
  const overdueTasks = tasks.filter((t) => isOverdue(t, now));
  const activeTasks = tasks.filter((t) => t.status !== "DONE");
  const nextEvents = events.filter((e) => new Date(e.startTime).getTime() >= now).slice(0, 4);

  return (
    <div>
      <GestionPageHeader title="Accueil" subtitle="Vue d'ensemble de la gestion administrative" />
      <div className="px-4 md:px-10 pb-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard value={pendingDocs.length} label="Documents à traiter" href="/gestion/documents" tone={pendingDocs.length > 0 ? "sunset" : "navy"} />
          <StatCard value={overdueTasks.length} label="Tâches en retard" href="/gestion/taches" tone={overdueTasks.length > 0 ? "red" : "navy"} />
          <StatCard value={activeTasks.length} label="Tâches actives" href="/gestion/taches" tone="navy" />
          <StatCard value={nextEvents.length} label="Événements à venir" href="/gestion/planning" tone="navy" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <Panel title="Documents à traiter" href="/gestion/documents" empty="Rien à traiter — tout est à jour." loading={loading} isEmpty={pendingDocs.length === 0}>
            {pendingDocs.slice(0, 5).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <p className="text-sm text-cream-50 truncate">{d.title}</p>
                <p className="text-xs text-navy-100/40 shrink-0">{formatDate(d.uploadedAt)}</p>
              </div>
            ))}
          </Panel>

          <Panel title="Tâches prioritaires" href="/gestion/taches" empty="Aucune tâche urgente." loading={loading} isEmpty={activeTasks.length === 0}>
            {[...overdueTasks, ...activeTasks.filter((t) => !isOverdue(t, now))].slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <p className="text-sm text-cream-50 truncate">{t.title}</p>
                {t.dueDate && (
                  <p className={clsx("text-xs shrink-0", isOverdue(t, now) ? "text-red-400 font-semibold" : "text-navy-100/40")}>
                    {formatDate(t.dueDate)}
                  </p>
                )}
              </div>
            ))}
          </Panel>
        </div>

        <Panel title="Prochains événements" href="/gestion/planning" empty="Rien de prévu pour l'instant." loading={loading} isEmpty={nextEvents.length === 0}>
          {nextEvents.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-cream-50 truncate">{e.title}</p>
                {e.category && <p className="text-xs text-navy-100/40">{e.category}</p>}
              </div>
              <p className="text-xs text-navy-100/40 shrink-0">{formatDateTime(e.startTime)}</p>
            </div>
          ))}
        </Panel>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
          <QuickLink href="/gestion/documents" icon={Inbox} label="Documents" />
          <QuickLink href="/gestion/taches" icon={ListChecks} label="Tâches" />
          <QuickLink href="/gestion/planning" icon={CalendarClock} label="Agenda" />
          <QuickLink href="/gestion/notes" icon={StickyNote} label="Notes" />
          <QuickLink href="/gestion/contacts" icon={Contact2} label="Contacts" />
          <QuickLink href="/gestion/visio" icon={Video} label="Visio" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, href, tone }: { value: number; label: string; href: string; tone: "navy" | "sunset" | "red" }) {
  const toneClass = { navy: "text-cream-50", sunset: "text-sunset-500", red: "text-red-400" }[tone];
  return (
    <Link href={href} className="bg-navy-900 rounded-2xl border border-navy-700 p-4 hover:border-sunset-500/50 transition-colors">
      <p className={clsx("text-2xl font-bold", toneClass)}>{value}</p>
      <p className="text-xs text-navy-100/50 mt-0.5">{label}</p>
    </Link>
  );
}

function Panel({
  title,
  href,
  empty,
  loading,
  isEmpty,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  loading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-navy-700">
        <h2 className="font-semibold text-cream-50 text-sm">{title}</h2>
        <Link href={href} className="flex items-center gap-1 text-xs text-sunset-500 hover:underline">
          Voir tout <ArrowRight size={12} />
        </Link>
      </div>
      {!loading && isEmpty && <p className="px-5 py-4 text-xs text-navy-100/50">{empty}</p>}
      <div className="divide-y divide-navy-800">{children}</div>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      href={href}
      className="bg-navy-900 rounded-2xl border border-navy-700 p-4 flex flex-col items-center gap-2 text-center hover:border-sunset-500/50 transition-colors"
    >
      <Icon size={20} className="text-sunset-500" />
      <span className="text-xs font-medium text-navy-100/70">{label}</span>
    </Link>
  );
}
