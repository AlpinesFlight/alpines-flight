"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import {
  CalendarClock,
  GraduationCap,
  Lock,
  Pencil,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  StickyNote,
  Trash2,
  UserRound,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Aircraft, Reservation, ReservationType, TrainingProgram, UserLite } from "@/types/models";
import { formatMoney } from "@/lib/format";
import { canManageFinance, isInstructorOrAbove } from "@/lib/permissions";
import { nightViolationMessage } from "@/lib/reservation-rules";
import {
  BookingKind,
  INSTRUCTOR_RATE,
  TYPE_LABELS,
  aeronauticalDay,
  bookableAircraft,
  combineDateTime,
  deriveReservationType,
  findAircraftConflict,
  findInstructorConflict,
  formatClock,
  formatDurationMs,
  formatSlot,
  instructionRateFor,
  isTraineePilot,
  personName,
  pickDefaultAircraft,
  programIdToSave,
  toDateInput,
  toTimeInput,
} from "@/lib/reservation-form";
import { CompleteFlightPanel, DepartPanel, InstructionRateSelect } from "./FlightReportPanels";
import { Field, Sheet, SheetFooter, SheetSection } from "./Sheet";

// Réservation d'un avion, sur le modèle des logiciels d'aéroclub type
// Aerogest : on choisit l'avion, le créneau, et l'instructeur s'il y en a un
// — c'est tout. Le type de vol (instruction, solo supervisé, location) n'est
// plus demandé, il se déduit de qui vole (voir deriveReservationType) ; la
// formation (tarif d'instruction) non plus, elle vient de l'inscription en
// cours du pilote (voir /api/reservations) et reste modifiable au
// compte-rendu. Un élève/pilote réserve pour lui-même : il n'a pas à se
// choisir dans une liste.

type Panel = "summary" | "edit" | "depart" | "complete";

interface ReservationModalProps {
  initialStart: Date;
  initialEnd: Date;
  // Avion de la colonne cliquée sur le planning (vue Jour), s'il y en a une.
  initialAircraftId?: string;
  existing?: Reservation | null;
  // Toutes les réservations chargées par le planning — pour signaler un
  // avion ou un instructeur déjà pris AVANT l'envoi (le serveur revérifie).
  reservations: Reservation[];
  aircraftList: Aircraft[];
  instructors: UserLite[];
  students: UserLite[];
  programs: TrainingProgram[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

export function ReservationModal(props: ReservationModalProps) {
  const { existing, onClose, onSaved } = props;
  const { data: session } = useSession();
  const me = session?.user?.id ?? "";
  const role = session?.user?.role;
  const isStaff = isInstructorOrAbove(role);
  const isOwner = !!existing && !!me && existing.studentId === me;
  const isDiscovery = existing?.type === "DISCOVERY";
  // Vol clôturé = verrouillé, sauf pour le Gérant (correction exceptionnelle
  // — ça touche au débit déjà comptabilisé, donc réservé aux finances).
  const isLocked = !!existing && existing.status === "COMPLETED" && !canManageFinance(role);
  // Un élève/pilote ne modifie et n'annule que SES réservations (règle aussi
  // appliquée par /api/reservations/[id]) ; un vol découverte se gère côté
  // staff (coordonnées client, tarif : page Vol découverte).
  const canEdit = !existing || (!isLocked && (isStaff || (isOwner && !isDiscovery)));
  const canAct = !!existing && (isStaff || isOwner);

  const [panel, setPanel] = useState<Panel>(existing ? "summary" : "edit");

  const title =
    panel === "depart"
      ? "Valider le départ"
      : panel === "complete"
      ? "Compte-rendu de vol"
      : !existing
      ? "Réserver un avion"
      : panel === "edit"
      ? "Modifier la réservation"
      : TYPE_LABELS[existing.type];
  // Rappel de l'avion et du créneau sur les écrans départ/retour — la fiche
  // et le formulaire les affichent déjà en clair.
  const subtitle =
    existing && (panel === "depart" || panel === "complete")
      ? `${existing.aircraft.registration} · ${formatSlot(new Date(existing.startTime), new Date(existing.endTime))}`
      : undefined;

  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      {panel === "summary" && existing && (
        <ReservationSummary
          reservation={existing}
          canEdit={canEdit}
          canAct={canAct}
          isStaff={isStaff}
          isLocked={isLocked}
          onEdit={() => setPanel("edit")}
          onDepart={() => setPanel("depart")}
          onComplete={() => setPanel("complete")}
          onCancelled={props.onDeleted ?? onSaved}
        />
      )}
      {panel === "edit" && canEdit && (
        <ReservationForm
          {...props}
          me={me}
          isStaff={isStaff}
          onBack={existing ? () => setPanel("summary") : undefined}
        />
      )}
      {panel === "depart" && existing && (
        <DepartPanel reservation={existing} onCancel={() => setPanel("summary")} onDeparted={onSaved} />
      )}
      {panel === "complete" && existing && (
        <CompleteFlightPanel
          reservation={existing}
          instructors={props.instructors}
          programs={props.programs}
          pilotProgramId={props.students.find((s) => s.id === existing.studentId)?.currentProgramId ?? null}
          onCancel={() => setPanel("summary")}
          onCompleted={onSaved}
        />
      )}
    </Sheet>
  );
}

// ---------- Fiche d'une réservation existante ----------

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "Réservé", className: "bg-navy-50 text-navy-700" },
  IN_FLIGHT: { label: "En vol", className: "bg-sunset-100 text-sunset-600" },
  COMPLETED: { label: "Vol effectué", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Annulé", className: "bg-navy-50 text-navy-500" },
};

function SummaryRow({ icon: Icon, children }: { icon: typeof Plane; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-2.5">
      <Icon size={16} className="text-navy-400 mt-0.5 shrink-0" />
      <div className="text-sm text-navy-800 min-w-0 break-words">{children}</div>
    </div>
  );
}

function ReservationSummary({
  reservation: r,
  canEdit,
  canAct,
  isStaff,
  isLocked,
  onEdit,
  onDepart,
  onComplete,
  onCancelled,
}: {
  reservation: Reservation;
  canEdit: boolean;
  canAct: boolean;
  isStaff: boolean;
  isLocked: boolean;
  onEdit: () => void;
  onDepart: () => void;
  onComplete: () => void;
  onCancelled: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = new Date(r.startTime);
  const end = new Date(r.endTime);
  const flies = r.type !== "MAINTENANCE";
  const canDepart = canAct && flies && r.status === "CONFIRMED";
  const canComplete = canAct && flies && (r.status === "IN_FLIGHT" || (isStaff && r.status === "CONFIRMED"));
  const chip = STATUS_CHIP[r.status] ?? STATUS_CHIP.CONFIRMED;

  const pilotLine =
    r.type === "DISCOVERY"
      ? [r.clientName, r.clientPhone, r.priceCents != null ? formatMoney(r.priceCents) : null].filter(Boolean).join(" · ")
      : r.type === "MAINTENANCE"
      ? null
      : r.student
      ? personName(r.student)
      : "Pilote à définir";
  const instructorLine = r.instructor
    ? r.type === "SOLO"
      ? `Solo supervisé par ${personName(r.instructor)}`
      : `Avec ${personName(r.instructor)}`
    : null;

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reservations/${r.id}`, { method: "DELETE" });
      onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="px-5 pb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              chip.className
            )}
          >
            {r.status === "IN_FLIGHT" && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sunset-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-sunset-500" />
              </span>
            )}
            {chip.label}
          </span>
          {r.isBaptism && (
            <span className="rounded-full bg-cream-100 text-navy-700 px-2.5 py-1 text-xs font-semibold">Vol baptême</span>
          )}
        </div>

        <div className="rounded-2xl border border-navy-100 divide-y divide-navy-100">
          <SummaryRow icon={Plane}>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: r.aircraft.color }} />
              <span className="font-semibold text-navy-900">{r.aircraft.registration}</span>
              <span className="text-navy-500">{r.aircraft.type}</span>
            </span>
          </SummaryRow>
          <SummaryRow icon={CalendarClock}>
            <span className="first-letter:uppercase inline-block">{formatSlot(start, end)}</span>{" "}
            <span className="text-navy-500">({formatDurationMs(end.getTime() - start.getTime())})</span>
          </SummaryRow>
          {pilotLine && <SummaryRow icon={UserRound}>{pilotLine}</SummaryRow>}
          {instructorLine && (
            <SummaryRow icon={GraduationCap}>
              {instructorLine}
              {r.type === "INSTRUCTION" && r.trainingProgram && (
                <span className="block text-xs text-navy-500 mt-0.5">
                  {r.trainingProgram.title}
                  {r.trainingProgram.instructionRateCents
                    ? ` · ${formatMoney(r.trainingProgram.instructionRateCents)}/h`
                    : ""}
                </span>
              )}
            </SummaryRow>
          )}
          {r.notes && <SummaryRow icon={StickyNote}>{r.notes}</SummaryRow>}
        </div>

        {(canDepart || canComplete) && (
          <div className="flex flex-col sm:flex-row gap-2">
            {canDepart && (
              <button
                type="button"
                onClick={onDepart}
                className="flex-1 h-11 rounded-xl bg-navy-800 hover:bg-navy-900 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <PlaneTakeoff size={17} /> Valider le départ
              </button>
            )}
            {canComplete && (
              <button
                type="button"
                onClick={onComplete}
                className={clsx(
                  "flex-1 h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors",
                  r.status === "IN_FLIGHT"
                    ? "bg-sunset-500 hover:bg-sunset-600 text-white"
                    : "border border-navy-200 text-navy-800 hover:bg-navy-50"
                )}
              >
                <PlaneLanding size={17} /> Valider le retour
              </button>
            )}
          </div>
        )}

        {isLocked && (
          <p className="text-sm text-navy-500 flex items-center gap-2">
            <Lock size={14} className="shrink-0" /> Vol clôturé : seul le Gérant peut encore le modifier.
          </p>
        )}
        {r.type === "DISCOVERY" && isStaff && (
          <p className="text-xs text-navy-500">
            Coordonnées du client et tarif :{" "}
            <a href="/decouverte" className="font-medium text-sunset-600 hover:underline">
              page Vol découverte
            </a>
            .
          </p>
        )}
        {error && <p className="text-sm text-red-600 bg-red-100/70 rounded-xl px-3 py-2">{error}</p>}
      </div>

      {canEdit && (
        <SheetFooter>
          {confirming ? (
            <>
              <span className="mr-auto text-sm font-medium text-navy-800">Annuler cette réservation ?</span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-sm font-medium text-navy-600 hover:text-navy-900 px-2"
              >
                Non
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="h-10 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {busy ? "Annulation…" : "Oui, annuler"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-500"
              >
                <Trash2 size={15} /> Annuler la réservation
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="ml-auto h-10 px-4 rounded-xl border border-navy-200 text-navy-800 hover:bg-navy-50 text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                <Pencil size={15} /> Modifier
              </button>
            </>
          )}
        </SheetFooter>
      )}
    </div>
  );
}

// ---------- Formulaire (création / modification) ----------

const DURATIONS = [
  { minutes: 60, label: "1h" },
  { minutes: 90, label: "1h30" },
  { minutes: 120, label: "2h" },
  { minutes: 180, label: "3h" },
];

// "de 10:00 à 11:00" si l'autre réservation tient dans la journée choisie,
// sinon avec les dates (réservation sur plusieurs jours).
function describeRange(r: Reservation, day: string): string {
  const s = new Date(r.startTime);
  const e = new Date(r.endTime);
  if (toDateInput(s) === day && toDateInput(e) === day) return `de ${formatClock(s)} à ${formatClock(e)}`;
  const d = (x: Date) => x.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `du ${d(s)} ${formatClock(s)} au ${d(e)} ${formatClock(e)}`;
}

function ReservationForm({
  existing,
  initialStart,
  initialEnd,
  initialAircraftId,
  reservations,
  aircraftList,
  instructors,
  students,
  programs,
  me,
  isStaff,
  onBack,
  onSaved,
}: ReservationModalProps & { me: string; isStaff: boolean; onBack?: () => void }) {
  const isDiscovery = existing?.type === "DISCOVERY";
  const fleet = useMemo(() => bookableAircraft(aircraftList, existing?.aircraftId), [aircraftList, existing?.aircraftId]);

  const [initial] = useState(() => ({
    start: existing ? new Date(existing.startTime) : initialStart,
    end: existing ? new Date(existing.endTime) : initialEnd,
  }));
  const [date, setDate] = useState(() => toDateInput(initial.start));
  const [startClock, setStartClock] = useState(() => toTimeInput(initial.start));
  const [endDate, setEndDate] = useState(() => toDateInput(initial.end));
  const [endClock, setEndClock] = useState(() => toTimeInput(initial.end));
  const [multiDay, setMultiDay] = useState(() => toDateInput(initial.start) !== toDateInput(initial.end));
  // null = rien choisi à la main : valeur par défaut recalculée à chaque
  // rendu (suit le créneau, et les listes qui arrivent parfois après
  // l'ouverture du formulaire sur un réseau mobile lent).
  const [aircraftChoice, setAircraftChoice] = useState<string | null>(existing?.aircraftId ?? initialAircraftId ?? null);
  // Plus de choix "Maintenance" dans la fenêtre (retiré à la demande) : on
  // réserve un vol. Un ancien blocage maintenance reste modifiable tel quel.
  const kind: BookingKind = existing?.type === "MAINTENANCE" ? "MAINTENANCE" : "FLIGHT";
  const [pilotChoice, setPilotChoice] = useState<string | null>(existing ? existing.studentId ?? "" : null);
  const [instructorChoice, setInstructorChoice] = useState<string | null>(
    existing ? existing.instructorId ?? "none" : null
  );
  const [soloSupervised, setSoloSupervised] = useState(existing?.type === "SOLO" && !!existing.instructorId);
  // Tarif d'instruction choisi à la main (null = proposé d'office, voir
  // autoRate plus bas).
  const [rateChoice, setRateChoice] = useState<string | null>(null);
  // Choisi ici, à la réservation — pas à la clôture (demande explicite :
  // "faux vol baptême" facturé après coup, alors qu'aucune case n'était
  // proposée avant le vol). Revérifié côté serveur contre
  // StudentProfile.canGiveBaptism.
  const [isBaptism, setIsBaptism] = useState(existing?.isBaptism ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const start = combineDateTime(date, startClock);
  const end = combineDateTime(multiDay ? endDate : date, endClock);
  const range = start && end && end > start ? { start, end } : null;

  const aircraftId =
    aircraftChoice ?? (range ? pickDefaultAircraft(fleet, reservations, range.start, range.end) : fleet[0]?.id ?? "");
  const aircraft = aircraftList.find((a) => a.id === aircraftId);

  // Pilote : un élève/pilote réserve pour lui-même ; le staff choisit (ou
  // laisse "à définir").
  const pilotId = isStaff ? pilotChoice ?? "" : me;
  const pilotIsTrainee = isTraineePilot(pilotId, students);
  const pilot = students.find((s) => s.id === pilotId) ?? instructors.find((i) => i.id === pilotId);
  // Instructeur : "none" = sans instructeur, "" = pas encore choisi. Un FI
  // qui réserve est proposé d'office ; un élève doit choisir explicitement
  // (sinon un oubli transformerait une leçon en vol solo).
  const meIsInstructor = !!me && instructors.some((i) => i.id === me);
  const defaultInstructor = isStaff && meIsInstructor && pilotId !== me ? me : pilotIsTrainee ? "" : "none";
  const instructorValue = instructorChoice ?? defaultInstructor;
  const instructorId = instructorValue && instructorValue !== "none" ? instructorValue : "";
  const instructor = instructors.find((i) => i.id === instructorId);

  const isFlight = isDiscovery || kind === "FLIGHT";
  const type: ReservationType = isDiscovery
    ? "DISCOVERY"
    : deriveReservationType({ kind, pilotIsTrainee, instructorId, soloSupervised });

  // Tarif d'instruction, affiché dès qu'un instructeur est à bord : celui
  // déjà fixé sur la réservation, sinon la formation en cours du pilote,
  // sinon le tarif propre de l'instructeur. La plupart des instructeurs n'en
  // ont pas : sans formation, le choix est alors demandé, plutôt que de
  // laisser l'instruction partir à 0 € au compte-rendu.
  const instructorRateCents = instructor?.instructorProfile?.hourlyRateCents ?? null;
  const pilotProgramId = students.find((s) => s.id === pilotId)?.currentProgramId ?? null;
  const autoRate =
    (existing?.type === "INSTRUCTION"
      ? existing.trainingProgramId || (instructorRateCents ? INSTRUCTOR_RATE : "")
      : "") ||
    pilotProgramId ||
    (instructorRateCents ? INSTRUCTOR_RATE : "");
  const rawRate = rateChoice ?? autoRate;
  const rateValue = rawRate === INSTRUCTOR_RATE && !instructorRateCents ? "" : rawRate;
  const ratePrograms = existing?.trainingProgram ? [...programs, existing.trainingProgram] : programs;
  const instructionRateCents =
    type === "INSTRUCTION" ? instructionRateFor(rateValue, ratePrograms, instructorRateCents) : null;

  // Vol baptême : seulement un vol seul (solo/location) d'un pilote autorisé
  // — un vol d'instruction facture déjà l'instructeur séparément.
  const canBeBaptism =
    !isDiscovery &&
    !!pilotId &&
    students.find((s) => s.id === pilotId)?.studentProfile?.canGiveBaptism === true &&
    (type === "SOLO" || type === "LOCATION");

  const aircraftConflict = range
    ? findAircraftConflict(reservations, aircraftId, range.start, range.end, existing?.id)
    : null;
  const instructorConflict =
    range && isFlight
      ? findInstructorConflict(reservations, instructorId, type, range.start, range.end, existing?.id)
      : null;
  const nightError = range ? nightViolationMessage(type, range.start, range.end) : null;
  const aeroDay = start && isFlight ? aeronauticalDay(start) : null;

  // Ce qui empêche d'enregistrer, dans l'ordre où on le corrige : une
  // indication neutre tant que la saisie est incomplète, en rouge pour un
  // vrai conflit — toujours une phrase, jamais un bouton grisé muet.
  let blocker: { text: string; tone: "hint" | "error" } | null = null;
  if (!start || !end) blocker = { text: "Indique la date et les heures.", tone: "hint" };
  else if (end <= start) blocker = { text: "L'heure de fin doit être après l'heure de début.", tone: "error" };
  else if (!aircraftId) blocker = { text: "Choisis un avion.", tone: "hint" };
  else if (nightError) blocker = { text: nightError, tone: "error" };
  else if (aircraftConflict)
    blocker = {
      text: `${aircraft?.registration ?? "Cet avion"} est déjà réservé ${describeRange(aircraftConflict, date)}${
        aircraftConflict.student ? ` (${personName(aircraftConflict.student)})` : ""
      }.`,
      tone: "error",
    };
  else if (isFlight && !isDiscovery && pilotIsTrainee && instructorValue === "")
    blocker = {
      text: `Choisis ${isStaff ? "l'" : "ton "}instructeur, ou « Sans instructeur » pour un vol solo.`,
      tone: "hint",
    };
  else if (instructorConflict)
    blocker = {
      text: `${personName(instructor)} est déjà à bord d'un autre vol ${describeRange(instructorConflict, date)}.`,
      tone: "error",
    };
  else if (type === "INSTRUCTION" && !instructionRateCents)
    blocker = {
      text: `Choisis le tarif d'instruction${
        instructor ? ` : ${instructor.firstName} n'a pas de tarif propre renseigné` : ""
      }.`,
      tone: "hint",
    };
  else if (isStaff && kind === "FLIGHT" && !isDiscovery && !pilotId && !instructorId)
    blocker = { text: "Indique le pilote, ou au moins l'instructeur.", tone: "hint" };
  else if (pilotId && instructorId && pilotId === instructorId)
    blocker = { text: "Le pilote et l'instructeur ne peuvent pas être la même personne.", tone: "error" };

  const studentIdToSave = isDiscovery ? existing?.studentId ?? null : kind === "MAINTENANCE" ? null : pilotId || null;
  const instructorIdToSave = kind === "MAINTENANCE" && !isDiscovery ? null : instructorId || null;
  const baptismToSave = canBeBaptism && isBaptism;
  const notesToSave = notes.trim() || null;
  const programToSave = type === "INSTRUCTION" ? programIdToSave(rateValue) : null;

  const dirty =
    !existing ||
    !range ||
    aircraftId !== existing.aircraftId ||
    range.start.getTime() !== new Date(existing.startTime).getTime() ||
    range.end.getTime() !== new Date(existing.endTime).getTime() ||
    type !== existing.type ||
    studentIdToSave !== existing.studentId ||
    instructorIdToSave !== existing.instructorId ||
    notesToSave !== (existing.notes ?? null) ||
    (!isDiscovery && baptismToSave !== existing.isBaptism) ||
    (!isDiscovery && programToSave !== (existing.trainingProgramId ?? null));

  function changeStartClock(value: string) {
    // Déplacer l'heure de début garde la durée choisie (la fin suit).
    if (!multiDay && range) {
      const next = combineDateTime(date, value);
      if (next) {
        const shiftedEnd = new Date(next.getTime() + (range.end.getTime() - range.start.getTime()));
        if (toDateInput(shiftedEnd) === date) setEndClock(toTimeInput(shiftedEnd));
      }
    }
    setStartClock(value);
  }

  function changeDate(value: string) {
    setDate(value);
    if (multiDay && endDate < value) setEndDate(value);
  }

  function applyDuration(minutes: number) {
    if (!start) return;
    const nextEnd = new Date(start.getTime() + minutes * 60_000);
    if (toDateInput(nextEnd) !== date) {
      setMultiDay(true);
      setEndDate(toDateInput(nextEnd));
    }
    setEndClock(toTimeInput(nextEnd));
  }

  function toggleMultiDay() {
    if (multiDay) {
      setMultiDay(false);
      setEndDate(date);
      const sameDayEnd = combineDateTime(date, endClock);
      if (start && (!sameDayEnd || sameDayEnd <= start)) {
        setEndClock(toTimeInput(new Date(start.getTime() + 60 * 60_000)));
      }
    } else {
      setMultiDay(true);
      setEndDate(date);
    }
  }

  function changePilot(value: string) {
    setPilotChoice(value);
    // Le pilote ne peut pas être son propre instructeur : on revient au
    // choix par défaut plutôt que de garder une combinaison impossible.
    if (value && value === instructorId) setInstructorChoice(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blocker || !range) return;
    setSaving(true);
    setError(null);
    try {
      const payload = isDiscovery
        ? {
            aircraftId,
            instructorId: instructorIdToSave,
            startTime: range.start.toISOString(),
            endTime: range.end.toISOString(),
            notes: notesToSave,
          }
        : {
            aircraftId,
            type,
            studentId: studentIdToSave,
            instructorId: instructorIdToSave,
            startTime: range.start.toISOString(),
            endTime: range.end.toISOString(),
            notes: notesToSave,
            isBaptism: baptismToSave,
            trainingProgramId: programToSave,
          };
      await apiFetch(existing ? `/api/reservations/${existing.id}` : "/api/reservations", {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  const durationMinutes = range ? Math.round((range.end.getTime() - range.start.getTime()) / 60_000) : 0;
  const trainees = students.filter((s) => s.studentProfile?.isPilot !== true);
  const licensed = students.filter((s) => s.studentProfile?.isPilot === true);

  const recap = !isFlight
    ? "Avion bloqué pour maintenance"
    : type === "DISCOVERY"
    ? `Vol découverte${existing?.clientName ? ` — ${existing.clientName}` : ""}`
    : type === "INSTRUCTION"
    ? `Vol d'instruction avec ${personName(instructor)}`
    : type === "SOLO"
    ? instructor
      ? `Solo supervisé par ${personName(instructor)}`
      : "Vol solo"
    : "Location — vol seul";

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-5 pb-5 flex flex-col gap-5">
        {isDiscovery && existing && (
          <div className="rounded-xl bg-cream-100/70 px-3.5 py-2.5 text-sm text-navy-800">
            <span className="font-semibold">Vol découverte</span> — {existing.clientName}
            {existing.clientPhone ? ` · ${existing.clientPhone}` : ""}
            <span className="block text-xs text-navy-500 mt-0.5">
              Coordonnées et tarif :{" "}
              <a href="/decouverte" className="font-medium text-sunset-600 hover:underline">
                page Vol découverte
              </a>
            </span>
          </div>
        )}

        {/* Sélecteur compact, même style que le choix Jour/Semaine du
            planning : une ligne, l'immatriculation (le type en clair à côté
            sur ordinateur). « pris » signale un avion déjà réservé sur le
            créneau choisi — le détail s'affiche en bas s'il est sélectionné
            (pas un point rouge : il se confondait avec la couleur d'un avion
            rouge comme F-BOKF). */}
        <SheetSection label="Avion">
          <div
            role="radiogroup"
            aria-label="Avion"
            className="grid gap-1 rounded-xl bg-navy-50 p-1"
            style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(fleet.length, 1), 3)}, minmax(0, 1fr))` }}
          >
            {fleet.map((a) => {
              const selected = a.id === aircraftId;
              const conflict = range
                ? findAircraftConflict(reservations, a.id, range.start, range.end, existing?.id)
                : null;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAircraftChoice(a.id)}
                  title={conflict ? `${a.registration} déjà réservé ${describeRange(conflict, date)}` : a.type}
                  className={clsx(
                    "h-9 min-w-0 rounded-lg px-2 flex items-center justify-center gap-1.5 text-sm transition-colors",
                    selected
                      ? "bg-white text-navy-900 shadow-sm ring-1 ring-navy-200"
                      : "text-navy-600 hover:text-navy-900 hover:bg-white/60"
                  )}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                  <span className="font-semibold">{a.registration}</span>
                  <span className="hidden sm:inline truncate text-xs font-normal text-navy-400">{a.type}</span>
                  {conflict && (
                    <span className="shrink-0 rounded px-1 text-[10px] font-semibold uppercase tracking-wide text-red-600 bg-red-100/70">
                      pris
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </SheetSection>

        <div className="flex flex-col gap-2">
          {multiDay ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Début">
                <input type="date" required value={date} onChange={(e) => changeDate(e.target.value)} className="input h-10" />
              </Field>
              <Field label="à">
                <input
                  type="time"
                  required
                  value={startClock}
                  onChange={(e) => setStartClock(e.target.value)}
                  className="input h-10"
                />
              </Field>
              <Field label="Fin">
                <input
                  type="date"
                  required
                  min={date}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input h-10"
                />
              </Field>
              <Field label="à">
                <input type="time" required value={endClock} onChange={(e) => setEndClock(e.target.value)} className="input h-10" />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-[1.5fr_1fr_1fr] gap-2">
              <div className="col-span-2 sm:col-span-1">
                <Field label="Date">
                  <input type="date" required value={date} onChange={(e) => changeDate(e.target.value)} className="input h-10" />
                </Field>
              </div>
              <Field label="De">
                <input
                  type="time"
                  required
                  value={startClock}
                  onChange={(e) => changeStartClock(e.target.value)}
                  className="input h-10"
                />
              </Field>
              <Field label="À">
                <input type="time" required value={endClock} onChange={(e) => setEndClock(e.target.value)} className="input h-10" />
              </Field>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {!multiDay &&
              DURATIONS.map((d) => (
                <button
                  key={d.minutes}
                  type="button"
                  onClick={() => applyDuration(d.minutes)}
                  className={clsx(
                    "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors",
                    durationMinutes === d.minutes
                      ? "bg-navy-800 border-navy-800 text-white"
                      : "border-navy-100 text-navy-600 hover:border-navy-300"
                  )}
                >
                  {d.label}
                </button>
              ))}
            <button
              type="button"
              onClick={toggleMultiDay}
              className="ml-auto text-xs font-medium text-sunset-600 hover:text-sunset-500"
            >
              {multiDay ? "Sur une seule journée" : "Sur plusieurs jours"}
            </button>
          </div>
          {aeroDay && !multiDay && (
            <p className="text-xs text-navy-500">
              Vol possible ce jour-là de {formatClock(aeroDay.start)} à {formatClock(aeroDay.end)} (nuit aéronautique en
              dehors).
            </p>
          )}
        </div>

        {isFlight && !isDiscovery && isStaff && (
          <Field label="Pilote">
            <select value={pilotId} onChange={(e) => changePilot(e.target.value)} className="input h-10">
              <option value="">À définir</option>
              {trainees.length > 0 && (
                <optgroup label="Élèves">
                  {trainees.map((s) => (
                    <option key={s.id} value={s.id}>
                      {personName(s)}
                    </option>
                  ))}
                </optgroup>
              )}
              {licensed.length > 0 && (
                <optgroup label="Pilotes brevetés">
                  {licensed.map((s) => (
                    <option key={s.id} value={s.id}>
                      {personName(s)}
                    </option>
                  ))}
                </optgroup>
              )}
              {/* Un FI peut lui-même être le pilote débité (deux FI qui
                  volent ensemble, l'un en instruction/contrôle de l'autre, ou
                  un FI qui loue l'avion) — son compte pilote est créé à la
                  volée à la clôture, voir /api/reservations/[id]/complete. */}
              <optgroup label="Instructeurs">
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {personName(i)}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
        )}

        {isFlight && (
          <div className="flex flex-col gap-2">
            <div className="grid gap-3">
              <Field label="Instructeur">
                <select
                  value={instructorValue}
                  onChange={(e) => setInstructorChoice(e.target.value)}
                  className="input h-10"
                >
                  {instructorValue === "" && (
                    <option value="" disabled>
                      Choisir…
                    </option>
                  )}
                  <option value="none">
                    {isDiscovery ? "Non désigné" : pilotIsTrainee ? "Sans instructeur — vol solo" : "Sans instructeur"}
                  </option>
                  {instructors
                    .filter((i) => i.id !== pilotId)
                    .map((i) => {
                      const busy =
                        range &&
                        findInstructorConflict(reservations, i.id, "INSTRUCTION", range.start, range.end, existing?.id);
                      return (
                        <option key={i.id} value={i.id}>
                          {personName(i)}
                          {busy ? " — déjà en vol" : ""}
                        </option>
                      );
                    })}
                </select>
              </Field>
              {type === "INSTRUCTION" && (
                <Field label="Tarif d'instruction">
                  <InstructionRateSelect
                    value={rateValue}
                    onChange={setRateChoice}
                    programs={programs}
                    extraProgram={existing?.trainingProgram ?? null}
                    instructor={instructor ?? null}
                  />
                </Field>
              )}
            </div>
            {!isDiscovery && pilotIsTrainee && instructor && (
              <label className="flex items-start gap-2.5 rounded-xl border border-navy-100 px-3.5 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloSupervised}
                  onChange={(e) => setSoloSupervised(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-navy-800 shrink-0"
                />
                <span className="text-sm text-navy-700">
                  Vol solo : {instructor.firstName} supervise depuis le sol
                </span>
              </label>
            )}
            {canBeBaptism && (
              <label className="flex items-start gap-2.5 rounded-xl border border-navy-100 px-3.5 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBaptism}
                  onChange={(e) => setIsBaptism(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-navy-800 shrink-0"
                />
                <span className="text-sm text-navy-700">
                  Vol baptême : aucun débit sur le compte de {pilot?.firstName ?? "ce pilote"}
                </span>
              </label>
            )}
          </div>
        )}

        <Field label="Note (facultatif)">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ex : navigation vers Sisteron"
            className="input h-10"
          />
        </Field>

        {range && !(isFlight && instructorValue === "") && (
          <p className="text-sm text-navy-600">
            <span className="font-semibold text-navy-900">{recap}</span>
            {" · "}
            {formatDurationMs(range.end.getTime() - range.start.getTime())}
            {isStaff && isFlight && !isDiscovery && pilot ? ` · ${personName(pilot)}` : ""}
            {instructionRateCents ? ` · instruction ${formatMoney(instructionRateCents)}/h` : ""}
          </p>
        )}

        {blocker && (
          <p
            className={clsx(
              "text-sm rounded-xl px-3 py-2",
              blocker.tone === "error" ? "text-red-600 bg-red-100/70" : "text-navy-600 bg-navy-50"
            )}
          >
            {blocker.text}
          </p>
        )}
        {error && <p className="text-sm text-red-600 bg-red-100/70 rounded-xl px-3 py-2">{error}</p>}
      </div>

      <SheetFooter>
        {onBack && (
          <button type="button" onClick={onBack} className="text-sm font-medium text-navy-600 hover:text-navy-900">
            Retour
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !!blocker || !dirty}
          className="ml-auto h-10 px-5 rounded-xl bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:hover:bg-sunset-500"
        >
          {saving ? "Enregistrement…" : existing ? "Enregistrer" : "Réserver"}
        </button>
      </SheetFooter>
    </form>
  );
}
