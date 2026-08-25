"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Aircraft, Reservation, TrainingProgram, UserLite } from "@/types/models";
import { ReservationModal } from "./ReservationModal";
import { Plus } from "lucide-react";

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
  noEventsInRange: "Aucune réservation sur cette période.",
  showMore: (total: number) => `+ ${total} de plus`,
};

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Reservation;
}

// Contenu personnalisé d'un événement : l'immatriculation en avant (grande,
// grasse) plutôt que l'horaire — react-big-calendar affiche l'horaire par
// défaut en premier, ce qui, dans une case étroite (deux réservations côte
// à côte au même horaire), ne laisse voir qu'un bout de l'heure. La
// position verticale sur le planning indique déjà l'horaire ; ce qu'il faut
// pouvoir lire d'un coup d'œil dans une case étroite, c'est quel avion.
function CalendarEventContent({ event }: { event: CalEvent }) {
  const r = event.resource;
  const badge = r.status === "IN_FLIGHT" ? "✈ " : r.status === "COMPLETED" ? "🔒 " : "";
  return (
    <div className="leading-tight overflow-hidden">
      <div className="font-bold text-[13px] truncate">
        {badge}
        {r.aircraft.registration}
      </div>
      <div className="text-[10px] opacity-90 truncate">{personLabel(r)}</div>
    </div>
  );
}

export function PlanningView() {
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([]);
  const [instructors, setInstructors] = useState<UserLite[]>([]);
  const [students, setStudents] = useState<UserLite[]>([]);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [aircraftFilter, setAircraftFilter] = useState<string>("ALL");
  const [instructorFilter, setInstructorFilter] = useState<string>("ALL");
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [modalState, setModalState] = useState<
    | { mode: "create"; start: Date; end: Date }
    | { mode: "edit"; reservation: Reservation }
    | null
  >(null);
  const [loading, setLoading] = useState(true);

  const loadRefData = useCallback(async () => {
    const [ac, ins, stu, pr] = await Promise.all([
      apiFetch<Aircraft[]>("/api/aircraft"),
      apiFetch<UserLite[]>("/api/instructors"),
      apiFetch<UserLite[]>("/api/students"),
      apiFetch<TrainingProgram[]>("/api/training/programs"),
    ]);
    setAircraftList(ac);
    setInstructors(ins);
    setStudents(stu);
    setPrograms(pr);
  }, []);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Reservation[]>("/api/reservations");
      setReservations(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRefData();
    loadReservations();
  }, [loadRefData, loadReservations]);

  const events: CalEvent[] = useMemo(() => {
    return reservations
      .filter((r) => aircraftFilter === "ALL" || r.aircraftId === aircraftFilter)
      .filter((r) => instructorFilter === "ALL" || r.instructorId === instructorFilter)
      .map((r) => ({
        id: r.id,
        title: `${r.status === "IN_FLIGHT" ? "✈ " : r.status === "COMPLETED" ? "🔒 " : ""}${r.aircraft.registration} · ${personLabel(r)}`,
        start: new Date(r.startTime),
        end: new Date(r.endTime),
        resource: r,
      }));
  }, [reservations, aircraftFilter, instructorFilter]);

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setModalState({ mode: "create", start: slotInfo.start, end: slotInfo.end });
  }, []);

  const handleSelectEvent = useCallback((event: CalEvent) => {
    setModalState({ mode: "edit", reservation: event.resource });
  }, []);

  function closeModal() {
    setModalState(null);
  }

  function handleSaved() {
    closeModal();
    loadReservations();
  }

  const eventPropGetter = useCallback((event: CalEvent) => {
    const color = event.resource.aircraft.color || "#0C2448";
    const cancelled = event.resource.status === "CANCELLED";
    const inFlight = event.resource.status === "IN_FLIGHT";
    const completed = event.resource.status === "COMPLETED";
    return {
      style: {
        // Clôturé = vert sourd et verrouillé (voir cadenas dans le titre) ;
        // annulé = gris ; en vol = couleur avion cerclée orange ; sinon
        // couleur de l'avion.
        backgroundColor: cancelled ? "#94a3b8" : completed ? "#3f6b4f" : color,
        color: "white",
        borderRadius: "6px",
        opacity: cancelled ? 0.5 : completed ? 0.85 : 1,
        border: inFlight ? "2px solid #F04818" : "none",
        cursor: completed ? "default" : "pointer",
      },
    };
  }, []);

  return (
    <div className="p-6 flex flex-col gap-4 h-[calc(100vh-97px)]">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={aircraftFilter}
          onChange={(e) => setAircraftFilter(e.target.value)}
          className="input max-w-[220px]"
        >
          <option value="ALL">Tous les avions</option>
          {aircraftList.map((a) => (
            <option key={a.id} value={a.id}>
              {a.registration} — {a.type}
            </option>
          ))}
        </select>

        <select
          value={instructorFilter}
          onChange={(e) => setInstructorFilter(e.target.value)}
          className="input max-w-[220px]"
        >
          <option value="ALL">Tous les instructeurs</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.firstName} {i.lastName}
            </option>
          ))}
        </select>

        <button
          onClick={() =>
            setModalState({
              mode: "create",
              start: new Date(),
              end: new Date(Date.now() + 60 * 60 * 1000),
            })
          }
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Nouvelle réservation
        </button>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-navy-100 p-4 min-h-0">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventPropGetter}
          messages={MESSAGES}
          culture="fr"
          min={new Date(1970, 0, 1, 6, 0)}
          max={new Date(1970, 0, 1, 21, 0)}
          // L'algorithme par défaut de react-big-calendar ("overlap") élargit
          // volontairement les événements simultanés au-delà de leur juste
          // part (×1.7) pour un effet "empilé" façon Google Calendar — d'où
          // le chevauchement visuel signalé. "no-overlap" partage l'espace à
          // parts égales entre événements simultanés (2 avions en même
          // temps = 50/50, sans jamais se chevaucher).
          dayLayoutAlgorithm="no-overlap"
          components={{ event: CalendarEventContent }}
          style={{ height: "100%" }}
        />
      </div>

      {loading && (
        <p className="text-xs text-navy-600">Chargement du planning…</p>
      )}

      {modalState?.mode === "create" && (
        <ReservationModal
          initialStart={modalState.start}
          initialEnd={modalState.end}
          aircraftList={aircraftList}
          instructors={instructors}
          students={students}
          programs={programs}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}

      {modalState?.mode === "edit" && (
        <ReservationModal
          initialStart={new Date(modalState.reservation.startTime)}
          initialEnd={new Date(modalState.reservation.endTime)}
          existing={modalState.reservation}
          aircraftList={aircraftList}
          instructors={instructors}
          students={students}
          programs={programs}
          onClose={closeModal}
          onSaved={handleSaved}
          onDeleted={handleSaved}
        />
      )}
    </div>
  );
}

function typeLabel(type: string) {
  switch (type) {
    case "INSTRUCTION":
      return "Instruction";
    case "SOLO":
      return "Solo";
    case "LOCATION":
      return "Location";
    case "MAINTENANCE":
      return "Maintenance";
    case "DISCOVERY":
      return "Vol découverte";
    default:
      return type;
  }
}

// Nom affiché sur le planning : l'élève s'il y en a un, sinon le client (vol
// découverte/baptême — voir Reservation.clientName), sinon le type de vol.
function personLabel(r: Reservation): string {
  if (r.student) return `${r.student.firstName} ${r.student.lastName}`;
  if (r.clientName) return r.clientName;
  return typeLabel(r.type);
}
