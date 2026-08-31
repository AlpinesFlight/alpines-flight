"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Calendar,
  dateFnsLocalizer,
  View,
  Views,
  SlotInfo,
} from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { fr } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { apiFetch } from "@/lib/api";
import { InstructorAvailability } from "@/types/models";
import { isGerant, canSeeInstructorAvailability } from "@/lib/permissions";
import { Plus, X, Trash2, ShieldAlert } from "lucide-react";

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
  noEventsInRange: "Aucune disponibilité sur cette période.",
  showMore: (total: number) => `+ ${total} de plus`,
};

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: InstructorAvailability;
}

function CalendarEventContent({ event }: { event: CalEvent }) {
  const a = event.resource;
  return (
    <div className="leading-tight overflow-hidden">
      <div className="font-bold text-[13px] truncate">
        {a.instructor.firstName} {a.instructor.lastName}
      </div>
      {a.notes && <div className="text-[10px] opacity-90 truncate">{a.notes}</div>}
    </div>
  );
}

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function InstructorAvailabilityView() {
  const { data: session } = useSession();
  const [availability, setAvailability] = useState<InstructorAvailability[]>([]);
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState<
    { mode: "create"; start: Date; end: Date } | { mode: "edit"; entry: InstructorAvailability } | null
  >(null);
  // Même constat que sur le Planning avions : la vue Semaine (7 colonnes)
  // devient illisible sur téléphone, retirée sous 768px.
  const [narrowScreen, setNarrowScreen] = useState(false);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setView(Views.DAY);
      setNarrowScreen(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<InstructorAvailability[]>("/api/instructor-availability");
      setAvailability(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const events: CalEvent[] = useMemo(
    () =>
      availability.map((a) => ({
        id: a.id,
        title: `${a.instructor.firstName} ${a.instructor.lastName}`,
        start: new Date(a.startTime),
        end: new Date(a.endTime),
        resource: a,
      })),
    [availability]
  );

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setModalState({ mode: "create", start: slotInfo.start, end: slotInfo.end });
  }, []);

  const handleSelectEvent = useCallback((event: CalEvent) => {
    setModalState({ mode: "edit", entry: event.resource });
  }, []);

  function closeModal() {
    setModalState(null);
  }
  function handleSaved() {
    closeModal();
    load();
  }

  const eventPropGetter = useCallback((event: CalEvent) => {
    const color = event.resource.instructor.instructorProfile?.color || "#0C2448";
    return {
      style: { backgroundColor: color, color: "white", borderRadius: "6px", border: "none" },
    };
  }, []);

  // Lien déjà masqué dans la page Planning pour tout autre rôle (voir
  // planning/page.tsx) — ce garde couvre l'accès direct par URL.
  if (!canSeeInstructorAvailability(session?.user?.role)) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 flex flex-col items-center text-center gap-2 max-w-md mx-auto mt-8">
          <ShieldAlert size={28} className="text-navy-400" />
          <p className="font-semibold text-navy-900">Accès réservé</p>
          <p className="text-sm text-navy-600">
            Les disponibilités des instructeurs sont réservées aux comptes FI et Gérant.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 flex flex-col gap-3 md:gap-4 h-[calc(100vh-160px)] md:h-[calc(100vh-97px)]">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-navy-600">
          Clique-glisse sur un créneau pour indiquer une disponibilité. Visible uniquement des FI et du Gérant.
        </p>
        <button
          onClick={() =>
            setModalState({
              mode: "create",
              start: new Date(),
              end: new Date(Date.now() + 2 * 60 * 60 * 1000),
            })
          }
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Nouvelle disponibilité
        </button>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-navy-100 p-1.5 md:p-4 min-h-0 overflow-x-auto">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={
            narrowScreen
              ? [Views.MONTH, Views.DAY, Views.AGENDA]
              : [Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]
          }
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventPropGetter}
          messages={MESSAGES}
          culture="fr"
          min={new Date(1970, 0, 1, 6, 0)}
          max={new Date(1970, 0, 1, 21, 0)}
          dayLayoutAlgorithm="no-overlap"
          components={{ event: CalendarEventContent }}
          style={{ height: "100%" }}
        />
      </div>

      {loading && <p className="text-xs text-navy-600">Chargement…</p>}

      {modalState && (
        <AvailabilityModal
          initialStart={modalState.mode === "create" ? modalState.start : new Date(modalState.entry.startTime)}
          initialEnd={modalState.mode === "create" ? modalState.end : new Date(modalState.entry.endTime)}
          existing={modalState.mode === "edit" ? modalState.entry : null}
          currentUserId={session?.user?.id}
          canManageAny={isGerant(session?.user?.role)}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function AvailabilityModal({
  initialStart,
  initialEnd,
  existing,
  currentUserId,
  canManageAny,
  onClose,
  onSaved,
}: {
  initialStart: Date;
  initialEnd: Date;
  existing: InstructorAvailability | null;
  currentUserId: string | undefined;
  canManageAny: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(toLocalInput(initialStart));
  const [end, setEnd] = useState(toLocalInput(initialEnd));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Lecture seule si c'est le créneau de quelqu'un d'autre et qu'on n'est
  // pas Gérant — on peut le voir (vue partagée) mais pas le modifier.
  const canEdit = !existing || existing.instructorId === currentUserId || canManageAny;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        notes: notes || null,
      };
      if (existing) {
        await apiFetch(`/api/instructor-availability/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/instructor-availability", {
          method: "POST",
          body: JSON.stringify(payload),
        });
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
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/instructor-availability/${existing.id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">
            {!existing
              ? "Nouvelle disponibilité"
              : canEdit
              ? "Modifier la disponibilité"
              : `Disponibilité de ${existing.instructor.firstName} ${existing.instructor.lastName}`}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {canEdit ? (
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-navy-600">Début</span>
                <input
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="input"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-navy-600">Fin</span>
                <input
                  type="datetime-local"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="input"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Notes (optionnel)</span>
              <input
                placeholder="ex : dispo pour vol découverte uniquement"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
              />
            </label>

            {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex items-center justify-between mt-1">
              {existing ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 size={16} /> Supprimer
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm transition-colors disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : existing ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </form>
        ) : (
          existing && (
            <div className="p-5 flex flex-col gap-2 text-sm text-navy-700">
              <p>
                {new Date(existing.startTime).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
                {" → "}
                {new Date(existing.endTime).toLocaleString("fr-FR", { timeStyle: "short" })}
              </p>
              {existing.notes && <p className="text-navy-500">{existing.notes}</p>}
            </div>
          )
        )}
      </div>
    </div>
  );
}
