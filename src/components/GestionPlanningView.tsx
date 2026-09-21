"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, View, Views, SlotInfo } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { fr } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { apiFetch } from "@/lib/api";
import { AdminEvent } from "@/types/models";
import { GestionPageHeader } from "@/components/GestionShell";
import { Plus, X, Trash2 } from "lucide-react";

const locales = { fr };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const MESSAGES = {
  today: "Aujourd'hui",
  previous: "Précédent",
  next: "Suivant",
  month: "Mois",
  week: "Semaine",
  day: "Jour",
  agenda: "Agenda",
  date: "Date",
  time: "Heure",
  event: "Événement",
  noEventsInRange: "Aucun événement sur cette période.",
  showMore: (total: number) => `+ ${total} de plus`,
};

// Couleur déterministe par catégorie (pas de champ couleur dédié sur
// AdminEvent, contrairement à Aircraft.color pour le planning des vols) —
// une même catégorie garde toujours la même couleur d'une session à
// l'autre, simplement dérivée de son nom.
const CATEGORY_COLORS = ["#f04818", "#2c8fd6", "#8b5cf6", "#22b07a", "#d33d10", "#e0a418"];
function categoryColor(category: string | null): string {
  if (!category) return "#2c4d74"; // navy-600 — sans catégorie
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: AdminEvent;
}

export function GestionPlanningView() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [narrowScreen, setNarrowScreen] = useState(false);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setView(Views.DAY);
      setNarrowScreen(true);
    }
  }, []);

  const [modalState, setModalState] = useState<
    { mode: "create"; start: Date; end: Date } | { mode: "edit"; event: AdminEvent } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<AdminEvent[]>("/api/admin/events");
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const calEvents: CalEvent[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.category ? `${e.category} — ${e.title}` : e.title,
        start: new Date(e.startTime),
        end: e.endTime ? new Date(e.endTime) : new Date(new Date(e.startTime).getTime() + 3600_000),
        resource: e,
      })),
    [events]
  );

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setModalState({ mode: "create", start: slotInfo.start, end: slotInfo.end });
  }, []);

  const handleSelectEvent = useCallback((event: CalEvent) => {
    setModalState({ mode: "edit", event: event.resource });
  }, []);

  function closeModal() {
    setModalState(null);
  }

  function handleSaved() {
    closeModal();
    load();
  }

  const eventPropGetter = useCallback((event: CalEvent) => {
    return {
      style: {
        backgroundColor: categoryColor(event.resource.category),
        color: "white",
        borderRadius: "6px",
        border: "none",
      },
    };
  }, []);

  return (
    <div>
      <GestionPageHeader
        title="Agenda"
        subtitle="Banque, DGAC, échéances — distinct du planning des vols"
        action={
          <button
            onClick={() =>
              setModalState({ mode: "create", start: new Date(), end: new Date(Date.now() + 3600_000) })
            }
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Ajouter un événement
          </button>
        }
      />
      <div className="px-4 md:px-10 pb-10">
        <div className="gestion-calendar bg-navy-900 rounded-2xl border border-navy-700 p-1.5 md:p-4 h-[70vh] min-h-[500px]">
          <Calendar
            localizer={localizer}
            events={calEvents}
            startAccessor="start"
            endAccessor="end"
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            views={narrowScreen ? [Views.MONTH, Views.DAY, Views.AGENDA] : [Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            selectable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventPropGetter}
            messages={MESSAGES}
            culture="fr"
            dayLayoutAlgorithm="no-overlap"
            style={{ height: "100%" }}
          />
        </div>
        {loading && <p className="text-xs text-navy-100/40 mt-3">Chargement de l&apos;agenda…</p>}
      </div>

      {modalState && (
        <EventModal
          initialStart={modalState.mode === "create" ? modalState.start : new Date(modalState.event.startTime)}
          initialEnd={modalState.mode === "create" ? modalState.end : undefined}
          existing={modalState.mode === "edit" ? modalState.event : null}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const CATEGORY_SUGGESTIONS = ["Banque", "DGAC", "Échéance fiscale", "RDV", "Assurance", "Autre"];

function EventModal({
  initialStart,
  initialEnd,
  existing,
  onClose,
  onSaved,
}: {
  initialStart: Date;
  initialEnd?: Date;
  existing: AdminEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [startTime, setStartTime] = useState(toLocalInput(existing ? new Date(existing.startTime) : initialStart));
  const [endTime, setEndTime] = useState(
    existing?.endTime ? toLocalInput(new Date(existing.endTime)) : initialEnd ? toLocalInput(initialEnd) : ""
  );
  const [location, setLocation] = useState(existing?.location ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        category: category || null,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        location: location || null,
        notes: notes || null,
      };
      if (existing) {
        await apiFetch(`/api/admin/events/${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/admin/events", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    if (!window.confirm(`Supprimer « ${existing.title} » de l'agenda ?`)) return;
    await apiFetch(`/api/admin/events/${existing.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700 sticky top-0 bg-navy-900">
          <h2 className="font-semibold text-cream-50">{existing ? "Modifier l'événement" : "Ajouter un événement"}</h2>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Titre</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-dark" required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-100/60">Début</span>
              <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-dark" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-100/60">Fin (optionnel)</span>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input-dark" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Catégorie (optionnel)</span>
            <input
              value={category ?? ""}
              onChange={(e) => setCategory(e.target.value)}
              className="input-dark"
              list="admin-event-categories"
              placeholder="Banque, DGAC..."
            />
            <datalist id="admin-event-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Lieu (optionnel)</span>
            <input value={location ?? ""} onChange={(e) => setLocation(e.target.value)} className="input-dark" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Notes (optionnel)</span>
            <textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} className="input-dark min-h-16" />
          </label>
          {error && <p className="text-red-400 text-sm bg-red-500/15 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : existing ? "Enregistrer" : "Ajouter"}
            </button>
            {existing && (
              <button
                type="button"
                onClick={handleDelete}
                title="Supprimer"
                className="rounded-lg border border-navy-700 text-navy-100/60 hover:text-red-400 hover:border-red-500/40 px-3 py-2"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
