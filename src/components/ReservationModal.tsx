"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Trash2, PlaneTakeoff, PlaneLanding, Plus, Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Aircraft, Reservation, ReservationType, TrainingProgram, UserLite } from "@/types/models";
import { formatMoney } from "@/lib/format";
import { canManageFinance, isInstructorOrAbove } from "@/lib/permissions";

// Types proposés à la création/édition depuis ce formulaire générique —
// DISCOVERY n'y figure pas volontairement : un vol découverte se crée et se
// modifie (coordonnées client, tarif) depuis la page dédiée /decouverte,
// pour ne pas dupliquer ce formulaire-ci. Il reste néanmoins visible et
// clôturable ici une fois apparu sur le planning (voir isDiscovery plus bas).
const TYPE_OPTIONS: { value: ReservationType; label: string }[] = [
  { value: "INSTRUCTION", label: "Instruction" },
  { value: "SOLO", label: "Solo" },
  { value: "LOCATION", label: "Location" },
  { value: "MAINTENANCE", label: "Maintenance" },
];
const TYPE_LABELS: Record<ReservationType, string> = {
  INSTRUCTION: "Instruction",
  SOLO: "Solo",
  LOCATION: "Location",
  MAINTENANCE: "Maintenance",
  DISCOVERY: "Vol découverte",
};

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function ReservationModal({
  initialStart,
  initialEnd,
  existing,
  aircraftList,
  instructors,
  students,
  programs,
  onClose,
  onSaved,
  onDeleted,
}: {
  initialStart: Date;
  initialEnd: Date;
  existing?: Reservation | null;
  aircraftList: Aircraft[];
  instructors: UserLite[];
  students: UserLite[];
  programs: TrainingProgram[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const { data: session } = useSession();
  const [aircraftId, setAircraftId] = useState(existing?.aircraftId ?? aircraftList[0]?.id ?? "");
  const [instructorId, setInstructorId] = useState(existing?.instructorId ?? "");
  // À la création (pas en édition), pré-remplit avec le compte qui réserve
  // s'il apparaît dans la liste des élèves/pilotes (donc jamais pour un FI/
  // Admin qui réserve pour quelqu'un d'autre) — sauf le Gérant, qui ne
  // réserve jamais pour lui-même non plus, exclu explicitement à la
  // demande même si en pratique il n'apparaît de toute façon pas dans
  // cette liste.
  const [studentId, setStudentId] = useState(() => {
    if (existing) return existing.studentId ?? "";
    if (session?.user?.role === "GERANT") return "";
    const self = students.find((s) => s.id === session?.user?.id);
    return self?.id ?? "";
  });
  const [trainingProgramId, setTrainingProgramId] = useState(existing?.trainingProgramId ?? "");
  const [type, setType] = useState<ReservationType>(existing?.type ?? "INSTRUCTION");
  const [start, setStart] = useState(toLocalInput(existing ? new Date(existing.startTime) : initialStart));
  const [end, setEnd] = useState(toLocalInput(existing ? new Date(existing.endTime) : initialEnd));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<"form" | "depart" | "complete">("form");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const showsInstructor = type === "INSTRUCTION" || type === "SOLO" || isDiscovery;
      const payload = {
        aircraftId,
        instructorId: showsInstructor ? instructorId || null : null,
        studentId: studentId || null,
        trainingProgramId: type === "INSTRUCTION" ? trainingProgramId || null : null,
        type,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        notes: notes || null,
      };

      if (existing) {
        await apiFetch(`/api/reservations/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/reservations`, {
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
    try {
      await apiFetch(`/api/reservations/${existing.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  const role = session?.user?.role;
  const isStaff = isInstructorOrAbove(role);
  const isOwner = !!existing && existing.studentId === session?.user?.id;
  const canAct = isStaff || isOwner;
  const isDiscovery = existing?.type === "DISCOVERY";

  // Vol clôturé = verrouillé, sauf pour le Gérant (correction exceptionnelle
  // — ça touche au débit déjà comptabilisé, donc réservé aux finances).
  const isLocked = !!existing && existing.status === "COMPLETED" && !canManageFinance(role);

  const canDepart = canAct && !!existing && existing.status === "CONFIRMED" && existing.type !== "MAINTENANCE";
  const canComplete =
    canAct &&
    !!existing &&
    existing.type !== "MAINTENANCE" &&
    (existing.status === "IN_FLIGHT" || (isStaff && existing.status === "CONFIRMED"));

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">
            {panel === "depart"
              ? "Validation du départ"
              : panel === "complete"
              ? "Compte-rendu de vol"
              : existing
              ? "Modifier la réservation"
              : "Nouvelle réservation"}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {panel === "depart" && existing && (
          <DepartPanel
            reservation={existing}
            onCancel={() => setPanel("form")}
            onDeparted={onSaved}
          />
        )}

        {panel === "complete" && existing && (
          <CompleteFlightPanel
            reservation={existing}
            instructors={instructors}
            programs={programs}
            onCancel={() => setPanel("form")}
            onCompleted={onSaved}
          />
        )}

        {panel === "form" && isLocked && existing && <LockedSummary reservation={existing} />}

        {panel === "form" && !isLocked && (
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {existing && existing.status === "IN_FLIGHT" && (
            <div className="rounded-lg bg-sunset-100 text-sunset-600 text-sm font-medium px-3 py-2 flex items-center gap-2">
              <PlaneTakeoff size={16} /> Vol en cours — départ validé
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Début">
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Fin">
              <input
                type="datetime-local"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <Field label="Avion">
            <select
              required
              value={aircraftId}
              onChange={(e) => setAircraftId(e.target.value)}
              className="input"
            >
              {aircraftList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.registration} — {a.type}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Type">
            {isDiscovery ? (
              <p className="input bg-navy-50 text-navy-600">Vol découverte</p>
            ) : (
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ReservationType)}
                className="input"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {isDiscovery ? (
            <Field label="Client">
              <p className="input bg-navy-50 text-navy-700">
                {existing?.clientName}
                {existing?.clientPhone ? ` · ${existing.clientPhone}` : ""}
                {existing?.priceCents != null ? ` · ${formatMoney(existing.priceCents)}` : ""}
              </p>
              <p className="text-[11px] text-navy-500 mt-1">
                Coordonnées et tarif modifiables depuis la page{" "}
                <a href="/decouverte" className="text-sunset-600 hover:underline">
                  Vol découverte
                </a>
                .
              </p>
            </Field>
          ) : (
            // Une location est prise par un pilote déjà breveté, pas un
            // élève en formation — même distinction que partout ailleurs
            // dans l'appli (voir StudentProfile.isPilot).
            <Field label={type === "LOCATION" ? "Pilote" : "Élève"}>
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input">
                <option value="">—</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {type === "INSTRUCTION" && (
            <Field label="Formation (détermine le tarif d'instruction)">
              <select
                value={trainingProgramId}
                onChange={(e) => setTrainingProgramId(e.target.value)}
                className="input"
              >
                <option value="">— tarif par défaut de l&apos;instructeur —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.instructionRateCents ? ` — ${formatMoney(p.instructionRateCents)}/h` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {(type === "INSTRUCTION" || type === "SOLO" || isDiscovery) && (
            <Field label="Instructeur">
              <select
                value={instructorId}
                onChange={(e) => setInstructorId(e.target.value)}
                className="input"
              >
                <option value="">—</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.firstName} {i.lastName}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-16"
            />
          </Field>

          {error && (
            <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-between mt-1">
            {existing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 size={16} /> Annuler la réservation
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

          {(canDepart || canComplete) && (
            <div className="flex items-center gap-2 border-t border-navy-100 pt-3 mt-1">
              {canDepart && (
                <button
                  type="button"
                  onClick={() => setPanel("depart")}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 font-semibold px-3.5 py-2 text-sm transition-colors"
                >
                  <PlaneTakeoff size={16} /> Valider le départ
                </button>
              )}
              {canComplete && (
                <button
                  type="button"
                  onClick={() => setPanel("complete")}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 font-semibold px-3.5 py-2 text-sm transition-colors"
                >
                  <PlaneLanding size={16} /> Valider le retour
                </button>
              )}
            </div>
          )}
        </form>
        )}
      </div>
    </div>
  );
}

function LockedSummary({ reservation }: { reservation: Reservation }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="rounded-lg bg-green-100 text-green-700 text-sm font-medium px-3 py-2 flex items-center gap-2">
        <Lock size={16} /> Vol clôturé — verrouillé. Seul le Gérant peut le modifier.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Avion">
          <p className="text-navy-800">{reservation.aircraft.registration}</p>
        </Field>
        <Field label="Type">
          <p className="text-navy-800">{TYPE_LABELS[reservation.type]}</p>
        </Field>
        <Field label={reservation.type === "DISCOVERY" ? "Client" : "Élève"}>
          <p className="text-navy-800">
            {reservation.student
              ? `${reservation.student.firstName} ${reservation.student.lastName}`
              : reservation.clientName ?? "—"}
          </p>
        </Field>
        <Field label="Instructeur">
          <p className="text-navy-800">
            {reservation.instructor
              ? `${reservation.instructor.firstName} ${reservation.instructor.lastName}`
              : "—"}
          </p>
        </Field>
        {reservation.trainingProgram && (
          <Field label="Formation">
            <p className="text-navy-800">{reservation.trainingProgram.title}</p>
          </Field>
        )}
      </div>
      {reservation.notes && (
        <Field label="Notes">
          <p className="text-navy-700">{reservation.notes}</p>
        </Field>
      )}
    </div>
  );
}

// Exporté : réutilisé tel quel par la page Vol découverte (/decouverte),
// dont les réservations passent par le même cycle départ/retour.
export function DepartPanel({
  reservation,
  onCancel,
  onDeparted,
}: {
  reservation: Reservation;
  onCancel: () => void;
  onDeparted: () => void;
}) {
  const [departureTime, setDepartureTime] = useState(toLocalInput(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/reservations/${reservation.id}/depart`, {
        method: "POST",
        body: JSON.stringify({ departureTime: new Date(departureTime).toISOString() }),
      });
      onDeparted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
      <p className="text-sm text-navy-600">
        {reservation.aircraft.registration} — confirme l&apos;heure de départ réelle. Le
        vol apparaîtra comme « en cours » jusqu&apos;au compte-rendu de retour.
      </p>
      <Field label="Heure de départ">
        <input
          type="datetime-local"
          required
          value={departureTime}
          onChange={(e) => setDepartureTime(e.target.value)}
          className="input"
        />
      </Field>
      {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex items-center justify-between mt-1">
        <button type="button" onClick={onCancel} className="text-sm text-navy-600 hover:text-navy-900">
          Retour
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-900 text-white font-semibold px-4 py-2 text-sm transition-colors disabled:opacity-60"
        >
          <PlaneTakeoff size={16} /> {saving ? "Validation..." : "Valider le départ"}
        </button>
      </div>
    </form>
  );
}

interface StopRow {
  airfield: string;
  touchAndGo: string;
}

const FUEL_CARD_OPTIONS: { value: string; label: string }[] = [
  { value: "BP", label: "BP" },
  { value: "TOTAL", label: "Total" },
  { value: "BADGE_TALLARD", label: "Badge Tallard" },
];
const FUEL_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "AVGAS_100LL", label: "Avgas 100LL" },
  { value: "SP98", label: "SP98" },
];

// Exporté : réutilisé tel quel par la page Vol découverte (/decouverte).
export function CompleteFlightPanel({
  reservation,
  instructors,
  programs,
  onCancel,
  onCompleted,
}: {
  reservation: Reservation;
  instructors: UserLite[];
  programs: TrainingProgram[];
  onCancel: () => void;
  onCompleted: () => void;
}) {
  const [departureTime, setDepartureTime] = useState(
    toLocalInput(reservation.actualDepartureTime ? new Date(reservation.actualDepartureTime) : new Date(reservation.startTime))
  );
  const [arrivalTime, setArrivalTime] = useState(toLocalInput(new Date()));
  // LFNA (Gap-Tallard) pré-rempli par défaut au départ — la grande majorité
  // des vols partent de la base de l'école, simple gain de temps, modifiable.
  const [departureAirfield, setDepartureAirfield] = useState("LFNA");
  const [arrivalAirfield, setArrivalAirfield] = useState("");
  const [instructorId, setInstructorId] = useState(reservation.instructorId ?? "");
  const [trainingProgramId, setTrainingProgramId] = useState(reservation.trainingProgramId ?? "");
  const [stops, setStops] = useState<StopRow[]>([{ airfield: "", touchAndGo: "1" }]);
  const [remarks, setRemarks] = useState("");
  const [fuelRefillDone, setFuelRefillDone] = useState(false);
  const [fuelCard, setFuelCard] = useState("BP");
  const [fuelLiters, setFuelLiters] = useState("");
  const [fuelType, setFuelType] = useState("AVGAS_100LL");
  const [fuelAirfield, setFuelAirfield] = useState("");
  const [isBaptism, setIsBaptism] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Vol baptême : le pilote qui vole (pas l'instructeur) doit être autorisé
  // par le Gérant (voir StudentProfile.canGiveBaptism) — revérifié côté
  // serveur de toute façon. N'a de sens que pour un vol solo/location : un
  // vol d'instruction facture déjà l'instructeur séparément.
  const canBeBaptism =
    !!reservation.studentId &&
    reservation.student?.studentProfile?.canGiveBaptism === true &&
    (reservation.type === "SOLO" || reservation.type === "LOCATION");

  const durationMs = new Date(arrivalTime).getTime() - new Date(departureTime).getTime();
  const duration = durationMs > 0 ? Math.round((durationMs / 3_600_000) * 10) / 10 : 0;
  const aircraftCostCents = duration > 0 ? Math.round(duration * reservation.aircraft.hourlyRateCents) : 0;

  const selectedInstructor = instructors.find((i) => i.id === instructorId);
  const selectedProgram = programs.find((p) => p.id === trainingProgramId);
  // Priorité au tarif de la formation visée (ex: PPL 25€/h, Montagne
  // 40€/h) ; à défaut, tarif horaire par défaut de l'instructeur.
  const programRateCents = selectedProgram?.instructionRateCents ?? null;
  const instructorRateCents = selectedInstructor?.instructorProfile?.hourlyRateCents ?? null;
  const instructionRateCents = programRateCents ?? instructorRateCents;
  const isInstructionFlight = reservation.type === "INSTRUCTION" && !!instructorId;
  const instructionCostCents =
    isInstructionFlight && instructionRateCents && duration > 0
      ? Math.round(duration * instructionRateCents)
      : 0;
  const totalCostCents = aircraftCostCents + instructionCostCents;

  function updateStop(index: number, patch: Partial<StopRow>) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function addStop() {
    setStops((prev) => [...prev, { airfield: "", touchAndGo: "1" }]);
  }
  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/reservations/${reservation.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          departureTime: new Date(departureTime).toISOString(),
          arrivalTime: new Date(arrivalTime).toISOString(),
          departureAirfield: departureAirfield.trim().toUpperCase(),
          arrivalAirfield: arrivalAirfield.trim().toUpperCase(),
          instructorId: instructorId || null,
          trainingProgramId: reservation.type === "INSTRUCTION" ? trainingProgramId || null : null,
          remarks: remarks || null,
          stops: stops
            .filter((s) => s.airfield.trim())
            .map((s) => ({ airfield: s.airfield.trim().toUpperCase(), touchAndGo: parseInt(s.touchAndGo, 10) || 1 })),
          isBaptism: canBeBaptism && isBaptism,
          fuelRefillDone,
          ...(fuelRefillDone
            ? {
                fuelCard,
                fuelLiters: parseFloat(fuelLiters) || null,
                fuelType,
                fuelAirfield: fuelAirfield.trim().toUpperCase() || null,
              }
            : {}),
        }),
      });
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
      <p className="text-sm text-navy-600">
        {reservation.aircraft.registration}
        {reservation.studentId && canBeBaptism && isBaptism
          ? " — vol baptême : les heures comptent, mais rien ne sera débité."
          : reservation.studentId
          ? " — le compte du pilote sera débité automatiquement."
          : reservation.priceCents != null
          ? ` — forfait de ${formatMoney(reservation.priceCents)} à encaisser sur place (aucun compte à débiter).`
          : " — vol sans compte pilote associé (aucun débit)."}
      </p>

      {canBeBaptism && (
        <label className="flex items-center gap-2 text-sm text-navy-700 rounded-lg border border-navy-100 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={isBaptism}
            onChange={(e) => setIsBaptism(e.target.checked)}
          />
          Vol baptême — {reservation.student?.firstName} est autorisé(e), aucun débit sur son compte
        </label>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Heure de départ">
          <input
            type="datetime-local"
            required
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Heure d'arrivée">
          <input
            type="datetime-local"
            required
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Terrain de départ (OACI)">
          <input
            required
            placeholder="ex : LFNA"
            value={departureAirfield}
            onChange={(e) => setDepartureAirfield(e.target.value.toUpperCase())}
            maxLength={12}
            className="input uppercase tracking-wide"
          />
        </Field>
        <Field label="Terrain de destination (OACI)">
          <input
            required
            placeholder="ex : LFNA"
            value={arrivalAirfield}
            onChange={(e) => setArrivalAirfield(e.target.value.toUpperCase())}
            maxLength={12}
            className="input uppercase tracking-wide"
          />
        </Field>
      </div>

      <Field label="Instructeur (si vol accompagné)">
        <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input">
          <option value="">— vol seul —</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.firstName} {i.lastName}
            </option>
          ))}
        </select>
      </Field>

      {reservation.type === "INSTRUCTION" && (
        <Field label="Formation (détermine le tarif d'instruction)">
          <select
            value={trainingProgramId}
            onChange={(e) => setTrainingProgramId(e.target.value)}
            className="input"
          >
            <option value="">— tarif par défaut de l&apos;instructeur —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.instructionRateCents ? ` — ${formatMoney(p.instructionRateCents)}/h` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-navy-600">
            Terrains posés — code OACI &amp; nombre de touchés
          </span>
          <button
            type="button"
            onClick={addStop}
            className="flex items-center gap-1 text-xs text-sunset-600 hover:underline"
          >
            <Plus size={12} /> Ajouter un terrain
          </button>
        </div>
        <div className="grid grid-cols-[1fr_88px_auto] gap-2 mb-1 px-0.5">
          <span className="text-[11px] text-navy-500">Code OACI</span>
          <span className="text-[11px] text-navy-500">Touchés</span>
          <span />
        </div>
        <div className="flex flex-col gap-2">
          {stops.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_88px_auto] gap-2 items-center">
              <input
                required
                placeholder="ex : LFNA"
                value={s.airfield}
                onChange={(e) => updateStop(i, { airfield: e.target.value.toUpperCase() })}
                maxLength={12}
                className="input uppercase tracking-wide"
              />
              <input
                type="number"
                min={1}
                value={s.touchAndGo}
                onChange={(e) => updateStop(i, { touchAndGo: e.target.value })}
                className="input"
              />
              {stops.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeStop(i)}
                  className="text-navy-600 hover:text-red-600"
                >
                  <X size={16} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      </div>

      <Field label="Remarques (optionnel)">
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className="input min-h-16"
        />
      </Field>

      <div className="rounded-lg border border-navy-100">
        <label className="flex items-center gap-2 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={fuelRefillDone}
            onChange={(e) => setFuelRefillDone(e.target.checked)}
          />
          <span className="text-sm font-medium text-navy-800">Plein de carburant effectué</span>
        </label>
        {fuelRefillDone && (
          <div className="px-3 pb-3 flex flex-col gap-2 border-t border-navy-100 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Carte utilisée">
                <select value={fuelCard} onChange={(e) => setFuelCard(e.target.value)} className="input">
                  {FUEL_CARD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type de carburant">
                <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="input">
                  {FUEL_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Litres">
                <input
                  required={fuelRefillDone}
                  type="number"
                  step="0.1"
                  min={0}
                  value={fuelLiters}
                  onChange={(e) => setFuelLiters(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Terrain (code OACI)">
                <input
                  required={fuelRefillDone}
                  placeholder="ex : LFNA"
                  value={fuelAirfield}
                  onChange={(e) => setFuelAirfield(e.target.value.toUpperCase())}
                  maxLength={12}
                  className="input uppercase tracking-wide"
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      {duration > 0 && (
        <div className="rounded-lg bg-navy-50 px-3 py-2.5 text-sm flex flex-col gap-1">
          <div className="flex justify-between text-navy-700">
            <span>
              Avion — {duration}h × {formatMoney(reservation.aircraft.hourlyRateCents)}/h
            </span>
            <span>{formatMoney(aircraftCostCents)}</span>
          </div>
          {isInstructionFlight && (
            <div className="flex justify-between text-navy-700">
              <span>
                Instruction
                {instructionRateCents
                  ? ` (${programRateCents ? selectedProgram!.title : "tarif instructeur"}) — ${duration}h × ${formatMoney(instructionRateCents)}/h`
                  : " (aucun tarif renseigné — ni formation, ni instructeur)"}
              </span>
              <span>{formatMoney(instructionCostCents)}</span>
            </div>
          )}
          {reservation.studentId && canBeBaptism && isBaptism ? (
            <div className="flex justify-between font-semibold text-green-700 border-t border-navy-100 pt-1 mt-0.5">
              <span>Vol baptême — aucun débit (coût ci-dessus indicatif)</span>
              <span>{formatMoney(totalCostCents)}</span>
            </div>
          ) : reservation.studentId ? (
            <div className="flex justify-between font-semibold text-red-600 border-t border-navy-100 pt-1 mt-0.5">
              <span>Total débité du compte pilote</span>
              <span>− {formatMoney(totalCostCents)}</span>
            </div>
          ) : (
            <div className="flex justify-between font-semibold text-navy-500 border-t border-navy-100 pt-1 mt-0.5">
              <span>Coût interne avion (indicatif, sans compte à débiter)</span>
              <span>{formatMoney(aircraftCostCents)}</span>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-center justify-between mt-1">
        <button type="button" onClick={onCancel} className="text-sm text-navy-600 hover:text-navy-900">
          Retour
        </button>
        <button
          type="submit"
          disabled={saving || duration <= 0}
          className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-900 text-white font-semibold px-4 py-2 text-sm transition-colors disabled:opacity-60"
        >
          <PlaneLanding size={16} />{" "}
          {saving
            ? "Clôture..."
            : reservation.studentId && canBeBaptism && isBaptism
            ? "Clôturer le vol baptême (sans débit)"
            : reservation.studentId
            ? "Clôturer et débiter le compte"
            : "Clôturer le vol"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-navy-600">{label}</span>
      {children}
    </label>
  );
}
