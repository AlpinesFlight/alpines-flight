"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  View,
  Views,
  SlotInfo,
  EventProps,
  ResourceHeaderProps,
  HeaderProps,
  DateHeaderProps,
} from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
  addDays,
  addWeeks,
  addMonths,
  isToday,
  isSameDay,
} from "date-fns";
import { fr } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Aircraft, Reservation, TrainingProgram, UserLite } from "@/types/models";
import { ReservationModal } from "./ReservationModal";
import { isAeronauticalNight, nightWindowsOverlapping } from "@/lib/sun-times";
import { aeronauticalDay, combineDateTime, defaultSlot, formatClock, toDateInput } from "@/lib/reservation-form";

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
  agenda: "Liste",
  date: "Date",
  time: "Heure",
  event: "Réservation",
  noEventsInRange: "Aucune réservation sur cette période.",
  showMore: (total: number) => `+ ${total} de plus`,
};

const FORMATS = {
  timeGutterFormat: "HH:mm",
  agendaDateFormat: "EEE d MMM",
  agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) => `${formatClock(start)} – ${formatClock(end)}`,
};

const AGENDA_LENGTH = 30;

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: Reservation;
}

interface AircraftResource {
  id: string;
  title: string;
  aircraft: Aircraft;
}

function typeShort(r: Reservation): string {
  switch (r.type) {
    case "INSTRUCTION":
      return r.instructor ? `Instruction · ${r.instructor.lastName}` : "Instruction";
    case "SOLO":
      return "Solo";
    case "LOCATION":
      return "Location";
    case "MAINTENANCE":
      return "Maintenance";
    case "DISCOVERY":
      return "Vol découverte";
    default:
      return r.type;
  }
}

// Nom affiché sur le planning : le pilote s'il y en a un, sinon le client
// (vol découverte — voir Reservation.clientName), sinon le type de vol.
function personLabel(r: Reservation): string {
  if (r.student) return `${r.student.firstName} ${r.student.lastName}`;
  if (r.clientName) return r.clientName;
  if (r.type === "MAINTENANCE") return "Maintenance";
  return "Pilote à définir";
}

function StatusMark({ r }: { r: Reservation }) {
  if (r.status === "IN_FLIGHT") return <span className="af-live-dot" aria-label="En vol" />;
  if (r.status === "COMPLETED") return <Check size={11} strokeWidth={3} className="shrink-0" aria-label="Vol effectué" />;
  return null;
}

// Vue Jour : une colonne par avion, l'avion est donc implicite — on lit
// d'abord QUI vole, puis l'horaire et le type.
function DayEvent({ event }: EventProps<CalEvent>) {
  const r = event.resource;
  return (
    <div className="af-ev-body">
      <div className="af-ev-title">
        <StatusMark r={r} />
        <span className="truncate">{personLabel(r)}</span>
      </div>
      <div className="af-ev-meta">
        {formatClock(event.start)}–{formatClock(event.end)} · {typeShort(r)}
      </div>
    </div>
  );
}

// Vue Semaine : tous les avions dans la même colonne du jour — on lit
// d'abord QUEL avion (case parfois étroite), puis qui.
function WeekEvent({ event }: EventProps<CalEvent>) {
  const r = event.resource;
  return (
    <div className="af-ev-body">
      <div className="af-ev-title">
        <StatusMark r={r} />
        <span className="truncate">{r.aircraft.registration}</span>
      </div>
      <div className="af-ev-meta">{personLabel(r)}</div>
    </div>
  );
}

function MonthEvent({ event }: EventProps<CalEvent>) {
  const r = event.resource;
  return (
    <div className="af-ev-title">
      <StatusMark r={r} />
      <span className="truncate">
        <span className="font-semibold">{formatClock(event.start)}</span> {r.aircraft.registration} · {personLabel(r)}
      </span>
    </div>
  );
}

function AgendaEvent({ event }: EventProps<CalEvent>) {
  const r = event.resource;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: r.aircraft.color }} />
      <span className="font-semibold text-navy-900">{r.aircraft.registration}</span>
      <span className="text-navy-800">{personLabel(r)}</span>
      <span className="text-navy-500">· {typeShort(r)}</span>
      {r.status === "IN_FLIGHT" && <span className="text-xs font-semibold text-sunset-600">En vol</span>}
      {r.status === "COMPLETED" && <span className="text-xs font-medium text-green-700">Effectué</span>}
    </div>
  );
}

function AircraftHeader({ resource }: ResourceHeaderProps<AircraftResource>) {
  const a = resource.aircraft;
  const statusText =
    a.status === "MAINTENANCE" ? "En maintenance" : a.status === "GROUNDED" ? "Immobilisé" : a.status === "RETIRED" ? "Retiré" : a.type;
  return (
    <div className="flex flex-col items-center leading-tight py-1">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-navy-900">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
        {a.registration}
      </span>
      <span className={clsx("text-[11px] font-normal truncate max-w-full", a.status === "AVAILABLE" ? "text-navy-500" : "text-amber-700")}>
        {statusText}
      </span>
    </div>
  );
}

function WeekDayHeader({ date }: HeaderProps) {
  const today = isToday(date);
  return (
    <span className="flex flex-col items-center gap-1 py-0.5">
      <span className={clsx("text-[11px] font-medium uppercase tracking-wide", today ? "text-sunset-600" : "text-navy-400")}>
        {format(date, "EEE", { locale: fr }).replace(".", "")}
      </span>
      <span
        className={clsx(
          "h-7 min-w-7 px-1 grid place-items-center rounded-full text-sm font-semibold leading-none",
          today ? "bg-sunset-500 text-white" : "text-navy-900"
        )}
      >
        {format(date, "d")}
      </span>
    </span>
  );
}

function MonthDateHeader({ date, onDrillDown }: DateHeaderProps) {
  return (
    <button type="button" onClick={onDrillDown} className={clsx("af-month-date", isToday(date) && "is-today")}>
      {format(date, "d")}
    </button>
  );
}

function rangeLabel(view: View, date: Date): string {
  if (view === Views.DAY) return format(date, "EEEE d MMMM yyyy", { locale: fr });
  if (view === Views.WEEK) {
    const s = startOfWeek(date, { weekStartsOn: 1 });
    const e = endOfWeek(date, { weekStartsOn: 1 });
    return s.getMonth() === e.getMonth()
      ? `${format(s, "d")} – ${format(e, "d MMMM yyyy", { locale: fr })}`
      : `${format(s, "d MMM", { locale: fr })} – ${format(e, "d MMM yyyy", { locale: fr })}`;
  }
  if (view === Views.MONTH) return format(date, "MMMM yyyy", { locale: fr });
  return `${format(date, "d MMM", { locale: fr })} – ${format(addDays(date, AGENDA_LENGTH), "d MMM yyyy", { locale: fr })}`;
}

const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;

// Plage horaire affichée (vues Jour/Semaine) : le jour aéronautique des
// jours visibles, une heure de marge de chaque côté — 6h-19h en novembre,
// 5h-22h fin juin — au lieu d'une grille fixe dont un bon tiers tombait la
// nuit en hiver. Élargie si une réservation déborde.
function timeBounds(view: View, date: Date, events: CalEvent[]): { min: Date; max: Date } {
  const days =
    view === Views.WEEK
      ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date, { weekStartsOn: 1 }), i))
      : [date];
  let lo = 24;
  let hi = 0;
  for (const d of days) {
    const aero = aeronauticalDay(d);
    if (aero) {
      lo = Math.min(lo, hourOf(aero.start));
      hi = Math.max(hi, hourOf(aero.end));
    }
  }
  if (lo === 24) {
    lo = 7;
    hi = 20;
  }
  for (const e of events) {
    if (!isSameDay(e.start, e.end) || !days.some((d) => isSameDay(d, e.start))) continue;
    lo = Math.min(lo, hourOf(e.start));
    hi = Math.max(hi, hourOf(e.end));
  }
  const minHour = Math.max(0, Math.floor(lo) - 1);
  const maxHour = Math.min(24, Math.ceil(hi) + 1);
  return {
    min: new Date(1970, 0, 1, minHour, 0),
    max: maxHour >= 24 ? new Date(1970, 0, 1, 23, 59) : new Date(1970, 0, 1, maxHour, 0),
  };
}

// Abonnement à la largeur d'écran (même seuil md que Sidebar.tsx) — false
// côté serveur et au premier rendu, pour ne pas désynchroniser l'hydratation.
const NARROW_QUERY = "(max-width: 767px)";
function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  );
}

function chipClass(active: boolean) {
  return clsx(
    "h-8 px-3 rounded-full border text-sm font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors shrink-0",
    active ? "bg-navy-800 border-navy-800 text-white" : "bg-white border-navy-100 text-navy-700 hover:border-navy-300"
  );
}

export function PlanningView() {
  const { data: session } = useSession();
  const me = session?.user?.id ?? "";
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([]);
  const [instructors, setInstructors] = useState<UserLite[]>([]);
  const [students, setStudents] = useState<UserLite[]>([]);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [aircraftFilter, setAircraftFilter] = useState<string>("ALL");
  const [instructorFilter, setInstructorFilter] = useState<string>("ALL");
  const [mineOnly, setMineOnly] = useState(false);
  // Semaine par défaut (demande du Gérant, 2026-11-12) ; sur téléphone, où
  // la semaine n'est pas proposée, c'est la vue Jour (voir `view` plus bas).
  const [selectedView, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(() => new Date());
  // Semaine (7 colonnes) devient illisible sur téléphone (vérifié : à 375px
  // de large, chaque colonne retombe à ~15px). Jour (une colonne par avion),
  // Mois et Liste restent lisibles, donc Semaine est retirée du choix sous md.
  const narrowScreen = useNarrowScreen();
  const view = narrowScreen && selectedView === Views.WEEK ? Views.DAY : selectedView;
  const [modalState, setModalState] = useState<
    | { mode: "create"; start: Date; end: Date; aircraftId?: string }
    | { mode: "edit"; reservation: Reservation }
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Rechargement après chaque réservation créée/modifiée : le planning reste
  // affiché pendant ce temps, une réponse périmée est ignorée.
  const [reloadKey, setReloadKey] = useState(0);
  const datePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<Aircraft[]>("/api/aircraft"),
      apiFetch<UserLite[]>("/api/instructors"),
      apiFetch<UserLite[]>("/api/students"),
      apiFetch<TrainingProgram[]>("/api/training/programs"),
    ])
      .then(([ac, ins, stu, pr]) => {
        if (cancelled) return;
        setAircraftList(ac);
        setInstructors(ins);
        setStudents(stu);
        setPrograms(pr);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Erreur de chargement");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Reservation[]>("/api/reservations")
      .then((data) => {
        if (cancelled) return;
        setReservations(data);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Erreur de chargement");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function reloadReservations() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  const events: CalEvent[] = useMemo(() => {
    return reservations
      .filter((r) => aircraftFilter === "ALL" || r.aircraftId === aircraftFilter)
      .filter((r) => instructorFilter === "ALL" || r.instructorId === instructorFilter)
      .filter((r) => !mineOnly || r.studentId === me || r.instructorId === me)
      .map((r) => ({
        id: r.id,
        title: [
          r.aircraft.registration,
          personLabel(r),
          `${formatClock(new Date(r.startTime))}–${formatClock(new Date(r.endTime))}`,
          typeShort(r),
        ].join(" · "),
        start: new Date(r.startTime),
        end: new Date(r.endTime),
        resourceId: r.aircraftId,
        resource: r,
      }));
  }, [reservations, aircraftFilter, instructorFilter, mineOnly, me]);

  // Colonnes de la vue Jour : la flotte en service (retirés exclus, sauf
  // s'ils ont une réservation ce jour-là), restreinte au filtre avion.
  const resources: AircraftResource[] = useMemo(() => {
    return aircraftList
      .filter((a) => aircraftFilter === "ALL" || a.id === aircraftFilter)
      .filter((a) => a.status !== "RETIRED" || events.some((e) => e.resourceId === a.id && isSameDay(e.start, date)))
      .map((a) => ({ id: a.id, title: a.registration, aircraft: a }));
  }, [aircraftList, aircraftFilter, events, date]);

  const filterAircraft = useMemo(() => aircraftList.filter((a) => a.status !== "RETIRED"), [aircraftList]);
  const bounds = useMemo(() => timeBounds(view, date, events), [view, date, events]);
  const views: View[] = narrowScreen
    ? [Views.DAY, Views.MONTH, Views.AGENDA]
    : [Views.DAY, Views.WEEK, Views.MONTH, Views.AGENDA];
  const viewLabels: Record<string, string> = { day: "Jour", week: "Semaine", month: "Mois", agenda: "Liste" };

  function shift(direction: 1 | -1) {
    setDate((d) =>
      view === Views.DAY
        ? addDays(d, direction)
        : view === Views.WEEK
        ? addWeeks(d, direction)
        : view === Views.MONTH
        ? addMonths(d, direction)
        : addDays(d, AGENDA_LENGTH * direction)
    );
  }

  function openCreate(start: Date, end: Date, aircraftId?: string) {
    setModalState({ mode: "create", start, end, aircraftId });
  }

  function openCreateDefault() {
    const slot = defaultSlot();
    openCreate(slot.start, slot.end, aircraftFilter === "ALL" ? undefined : aircraftFilter);
  }

  const handleSelectSlot = useCallback(
    (slot: SlotInfo) => {
      const resourceId = typeof slot.resourceId === "string" ? slot.resourceId : undefined;
      if (view === Views.MONTH) {
        // Un clic sur un jour du mois : le formulaire s'ouvre sur ce jour,
        // en début de matinée (ou au lever du jour aéronautique s'il est
        // plus tardif), pour 1h — jamais une "réservation" de 24h.
        const aero = aeronauticalDay(slot.start);
        const nine = new Date(slot.start.getFullYear(), slot.start.getMonth(), slot.start.getDate(), 9, 0);
        const start = aero && aero.start > nine ? aero.start : nine;
        start.setSeconds(0, 0);
        const rounded = new Date(start);
        if (rounded.getMinutes() % 30) rounded.setMinutes(rounded.getMinutes() < 30 ? 30 : 60);
        openCreate(rounded, new Date(rounded.getTime() + 60 * 60_000));
        return;
      }
      // Simple clic = une case de 30 min : on propose 1h par défaut. Un
      // glisser garde la plage glissée.
      const end =
        slot.end.getTime() - slot.start.getTime() <= 30 * 60_000
          ? new Date(slot.start.getTime() + 60 * 60_000)
          : slot.end;
      openCreate(slot.start, end, resourceId);
    },
    [view]
  );

  const handleSelectEvent = useCallback((event: CalEvent) => {
    setModalState({ mode: "edit", reservation: event.resource });
  }, []);

  function closeModal() {
    setModalState(null);
  }

  function handleSaved() {
    closeModal();
    reloadReservations();
  }

  const eventPropGetter = useCallback((event: CalEvent) => {
    const r = event.resource;
    // Une réservation ne peut chevaucher une nuit aéronautique que si elle
    // s'étend sur plusieurs jours (voir nightViolationMessage, qui refuse
    // tout chevauchement partiel) : l'avion n'y "vole" pas vraiment, il est
    // juste ailleurs — bloc atténué pour ne pas laisser croire le contraire.
    const spansNight = nightWindowsOverlapping(new Date(r.startTime), new Date(r.endTime)).length > 0;
    return {
      className: clsx(
        "af-ev",
        r.status === "IN_FLIGHT" && "af-ev--inflight",
        r.status === "COMPLETED" && "af-ev--done",
        r.type === "MAINTENANCE" && "af-ev--maintenance",
        spansNight && "af-ev--away",
        !!me && (r.studentId === me || r.instructorId === me) && "af-ev--mine"
      ),
      style: { "--ev": r.aircraft.color || "#0c2448" } as React.CSSProperties,
    };
  }, [me]);

  // Fond hachuré pendant la nuit aéronautique (voir src/lib/sun-times.ts) —
  // calcul 100% local, aucun appel réseau.
  const nightSlotPropGetter = useCallback((slotDate: Date) => {
    const mid = new Date(slotDate.getTime() + 15 * 60 * 1000);
    return isAeronauticalNight(mid) ? { className: "af-night" } : {};
  }, []);

  const components = useMemo(
    () => ({
      day: { event: DayEvent },
      week: { event: WeekEvent, header: WeekDayHeader },
      month: { event: MonthEvent, dateHeader: MonthDateHeader },
      agenda: { event: AgendaEvent },
      resourceHeader: AircraftHeader,
    }),
    []
  );

  return (
    // flex-1 : prend toute la hauteur laissée par l'en-tête et les onglets
    // (la page planning est une colonne pleine hauteur, voir planning/page.tsx).
    <div className="af-planning flex-1 min-h-[520px] p-3 md:p-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center rounded-xl border border-navy-100 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Précédent"
            className="h-9 w-9 grid place-items-center text-navy-700 hover:bg-navy-50"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => setDate(new Date())}
            className="h-9 px-3 text-sm font-medium text-navy-800 border-x border-navy-100 hover:bg-navy-50"
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Suivant"
            className="h-9 w-9 grid place-items-center text-navy-700 hover:bg-navy-50"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {/* Le titre ouvre un calendrier pour sauter directement à une date
            (réserver dans trois semaines sans cliquer vingt fois sur ›). */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              const el = datePickerRef.current;
              if (!el) return;
              try {
                el.showPicker();
              } catch {
                el.focus();
              }
            }}
            className="flex items-center gap-1 rounded-lg px-1.5 -mx-1.5 py-0.5 hover:bg-navy-50 transition-colors"
          >
            <h2 className="font-[family-name:var(--font-display)] text-base md:text-lg font-semibold text-navy-900 first-letter:uppercase">
              {rangeLabel(view, date)}
            </h2>
            <ChevronDown size={16} className="text-navy-400" />
          </button>
          <input
            ref={datePickerRef}
            type="date"
            tabIndex={-1}
            aria-label="Aller à une date"
            value={toDateInput(date)}
            onChange={(e) => {
              const picked = combineDateTime(e.target.value, "12:00");
              if (picked) setDate(picked);
            }}
            className="absolute left-0 top-full h-0 w-0 opacity-0 pointer-events-none"
          />
        </div>
        {loading && <span className="text-xs text-navy-400">Chargement…</span>}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-xl bg-navy-50 p-1" role="tablist" aria-label="Affichage">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={clsx(
                  "h-7 px-2.5 sm:px-3 rounded-lg text-sm font-medium transition-colors",
                  view === v ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-800"
                )}
              >
                {viewLabels[v]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openCreateDefault}
            className="hidden md:flex items-center gap-1.5 h-9 rounded-xl bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-4 shadow-sm transition-colors"
          >
            <Plus size={16} /> Réserver
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" onClick={() => setAircraftFilter("ALL")} className={chipClass(aircraftFilter === "ALL")}>
          Tous les avions
        </button>
        {filterAircraft.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAircraftFilter(aircraftFilter === a.id ? "ALL" : a.id)}
            className={chipClass(aircraftFilter === a.id)}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
            {a.registration}
          </button>
        ))}
        <span className="h-5 w-px bg-navy-100 mx-1 shrink-0" aria-hidden="true" />
        <button type="button" onClick={() => setMineOnly((v) => !v)} className={chipClass(mineOnly)}>
          Mes vols
        </button>
        <select
          value={instructorFilter}
          onChange={(e) => setInstructorFilter(e.target.value)}
          aria-label="Filtrer par instructeur"
          className={clsx(
            "h-8 rounded-full border pl-3 pr-8 text-sm font-medium shrink-0 focus:outline-none focus:ring-2 focus:ring-sunset-500",
            instructorFilter === "ALL" ? "bg-white border-navy-100 text-navy-700" : "bg-navy-800 border-navy-800 text-white"
          )}
        >
          <option value="ALL">Tous les instructeurs</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.firstName} {i.lastName}
            </option>
          ))}
        </select>
      </div>

      {loadError && <p className="text-sm text-red-600 bg-red-100/70 rounded-xl px-3 py-2">{loadError}</p>}

      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-navy-100 shadow-sm overflow-hidden">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          tooltipAccessor="title"
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={views}
          toolbar={false}
          resources={view === Views.DAY ? resources : undefined}
          resourceIdAccessor="id"
          resourceTitleAccessor="title"
          resourceAccessor="resourceId"
          selectable
          popup
          showMultiDayTimes
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventPropGetter}
          slotPropGetter={nightSlotPropGetter}
          messages={MESSAGES}
          formats={FORMATS}
          culture="fr"
          length={AGENDA_LENGTH}
          min={bounds.min}
          max={bounds.max}
          // L'algorithme par défaut ("overlap") élargit les événements
          // simultanés au-delà de leur part pour un effet "empilé" — d'où des
          // chevauchements. "no-overlap" partage l'espace à parts égales.
          dayLayoutAlgorithm="no-overlap"
          components={components}
          style={{ height: "100%" }}
        />
      </div>

      {(view === Views.DAY || view === Views.WEEK) && (
        <p className="flex items-center gap-1.5 text-xs text-navy-500 -mt-1">
          <span className="af-night-swatch h-3 w-4 rounded-sm border border-navy-100 shrink-0" aria-hidden="true" />
          Zones hachurées : nuit aéronautique, aucun vol possible.
        </p>
      )}

      <button
        type="button"
        onClick={openCreateDefault}
        aria-label="Réserver un avion"
        className="md:hidden fixed bottom-5 right-5 z-30 h-14 w-14 rounded-full bg-sunset-500 hover:bg-sunset-600 text-white shadow-lg shadow-sunset-500/30 grid place-items-center transition-colors"
      >
        <Plus size={26} />
      </button>

      {modalState?.mode === "create" && (
        <ReservationModal
          initialStart={modalState.start}
          initialEnd={modalState.end}
          initialAircraftId={modalState.aircraftId}
          reservations={reservations}
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
          reservations={reservations}
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
