"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { PlaneTakeoff, PlaneLanding, Plus, X, Fuel } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Reservation, TrainingProgram, UserLite } from "@/types/models";
import { formatMoney, formatHoursMinutes, durationHours } from "@/lib/format";
import { combineDateTime, toDateInput, toTimeInput, personName } from "@/lib/reservation-form";
import { Field, SheetFooter } from "./Sheet";

// Départ et retour d'un vol réservé — utilisés par le planning
// (ReservationModal) et par la page Vol découverte (DecouverteView).

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-red-600 bg-red-100/70 rounded-xl px-3 py-2">{message}</p>;
}

export function DepartPanel({
  reservation,
  onCancel,
  onDeparted,
}: {
  reservation: Reservation;
  onCancel: () => void;
  onDeparted: () => void;
}) {
  // Maintenant si le vol est prévu aujourd'hui, sinon l'heure prévue du
  // vol (départ validé après coup) — la date ne se ressaisit pas.
  const [initial] = useState(() => {
    const planned = new Date(reservation.startTime);
    const now = new Date();
    return toDateInput(now) === toDateInput(planned) ? now : planned;
  });
  const [date, setDate] = useState(() => toDateInput(initial));
  const [time, setTime] = useState(() => toTimeInput(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const departure = combineDateTime(date, time);
    if (!departure) {
      setError("Indique la date et l'heure de départ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/reservations/${reservation.id}/depart`, {
        method: "POST",
        body: JSON.stringify({ departureTime: departure.toISOString() }),
      });
      onDeparted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-5 pb-5 flex flex-col gap-4">
        <p className="text-sm text-navy-600">
          {reservation.aircraft.registration} apparaîtra « en vol » sur le planning jusqu&apos;au compte-rendu de
          retour.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input h-10" />
          </Field>
          <Field label="Heure de départ">
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="input h-10" />
          </Field>
        </div>
        <ErrorLine message={error} />
      </div>
      <SheetFooter>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-navy-600 hover:text-navy-900">
          Retour
        </button>
        <button
          type="submit"
          disabled={saving}
          className="ml-auto flex items-center gap-2 rounded-xl bg-navy-800 hover:bg-navy-900 text-white font-semibold px-4 h-10 text-sm transition-colors disabled:opacity-60"
        >
          <PlaneTakeoff size={16} /> {saving ? "Validation…" : "Valider le départ"}
        </button>
      </SheetFooter>
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
  // Une seule date (un vol VFR de jour ne passe jamais minuit), puis les
  // deux heures. Départ : l'heure validée au départ, sinon l'heure prévue.
  // Arrivée : maintenant si on clôture le jour même après le départ, sinon
  // l'heure de fin prévue.
  const [initial] = useState(() => {
    const departure = reservation.actualDepartureTime
      ? new Date(reservation.actualDepartureTime)
      : new Date(reservation.startTime);
    const now = new Date();
    const arrival =
      toDateInput(now) === toDateInput(departure) && now > departure ? now : new Date(reservation.endTime);
    return { departure, arrival };
  });
  const [flightDate, setFlightDate] = useState(() => toDateInput(initial.departure));
  const [departureClock, setDepartureClock] = useState(() => toTimeInput(initial.departure));
  const [arrivalClock, setArrivalClock] = useState(() => toTimeInput(initial.arrival));
  // LFNA (Gap-Tallard) pré-rempli par défaut au départ — la grande majorité
  // des vols partent de la base de l'école, simple gain de temps, modifiable.
  const [departureAirfield, setDepartureAirfield] = useState("LFNA");
  const [arrivalAirfield, setArrivalAirfield] = useState("");
  const [instructorId, setInstructorId] = useState(reservation.instructorId ?? "");
  const [trainingProgramId, setTrainingProgramId] = useState(reservation.trainingProgramId ?? "");
  // Instructeur et formation sont déjà connus depuis la réservation :
  // résumés sur une ligne, dépliés seulement pour les corriger (ou d'office
  // s'il manque l'instructeur d'un vol d'instruction).
  const [crewOpen, setCrewOpen] = useState(reservation.type === "INSTRUCTION" && !reservation.instructorId);
  // Vide par défaut : un vol direct posé en complet à destination n'a aucun
  // touché à déclarer — son atterrissage à destination est compté d'office.
  const [stops, setStops] = useState<StopRow[]>([]);
  const [remarks, setRemarks] = useState("");
  const [fuelRefillDone, setFuelRefillDone] = useState(false);
  const [fuelCard, setFuelCard] = useState("BP");
  const [fuelLiters, setFuelLiters] = useState("");
  const [fuelType, setFuelType] = useState("AVGAS_100LL");
  const [fuelAirfield, setFuelAirfield] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Tarif avion réellement appliqué à la clôture — peut différer du tarif
  // standard de l'avion si ce pilote a une dérogation (voir
  // PilotAircraftRate, réglable par le Gérant uniquement). Le calcul final
  // se fait de toute façon côté serveur (jamais transmis dans le POST
  // ci-dessous) ; ceci ne sert qu'à afficher une estimation juste pendant
  // la saisie plutôt que de laisser croire au tarif standard par défaut.
  const [aircraftRateCents, setAircraftRateCents] = useState(reservation.aircraft.hourlyRateCents);
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ rateCents: number }>(`/api/reservations/${reservation.id}/effective-rate`)
      .then((r) => {
        if (!cancelled) setAircraftRateCents(r.rateCents);
      })
      .catch(() => {
        // Best-effort : en cas d'échec, on garde le tarif standard déjà
        // affiché plutôt que de bloquer la saisie du compte-rendu.
      });
    return () => {
      cancelled = true;
    };
  }, [reservation.id]);

  // Décidé à la réservation (Reservation.isBaptism), pas ici — revérifié de
  // toute façon côté serveur au moment de la clôture (l'autorisation du
  // pilote a pu être retirée depuis).
  const isBaptism = reservation.isBaptism;

  const departure = combineDateTime(flightDate, departureClock);
  const arrival = combineDateTime(flightDate, arrivalClock);
  const durationMs = departure && arrival ? arrival.getTime() - departure.getTime() : 0;
  const duration = durationMs > 0 && departure && arrival ? durationHours(departure, arrival) : 0;
  const aircraftCostCents = duration > 0 ? Math.round(duration * aircraftRateCents) : 0;

  const selectedInstructor = instructors.find((i) => i.id === instructorId);
  const selectedProgram = programs.find((p) => p.id === trainingProgramId);
  // Priorité au tarif de la formation visée (ex: PPL 25€/h, Montagne
  // 40€/h) ; à défaut, tarif horaire par défaut de l'instructeur.
  const programRateCents = selectedProgram?.instructionRateCents ?? null;
  const instructorRateCents = selectedInstructor?.instructorProfile?.hourlyRateCents ?? null;
  const instructionRateCents = programRateCents ?? instructorRateCents;
  const isInstructionFlight = reservation.type === "INSTRUCTION" && !!instructorId;
  const instructionCostCents =
    isInstructionFlight && instructionRateCents && duration > 0 ? Math.round(duration * instructionRateCents) : 0;
  const totalCostCents = aircraftCostCents + instructionCostCents;

  const rateText = programRateCents
    ? `${selectedProgram!.title} (${formatMoney(programRateCents)}/h)`
    : instructorRateCents
    ? `tarif de l'instructeur (${formatMoney(instructorRateCents)}/h)`
    : "aucun tarif renseigné (ni formation, ni instructeur)";

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
    if (!departure || !arrival) {
      setError("Indique la date et les heures du vol.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/reservations/${reservation.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          departureTime: departure.toISOString(),
          arrivalTime: arrival.toISOString(),
          departureAirfield: departureAirfield.trim().toUpperCase(),
          arrivalAirfield: arrivalAirfield.trim().toUpperCase(),
          instructorId: instructorId || null,
          trainingProgramId: reservation.type === "INSTRUCTION" ? trainingProgramId || null : null,
          remarks: remarks.trim() || null,
          stops: stops
            .filter((s) => s.airfield.trim())
            .map((s) => ({ airfield: s.airfield.trim().toUpperCase(), touchAndGo: parseInt(s.touchAndGo, 10) || 1 })),
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
    <form onSubmit={handleSubmit}>
      <div className="px-5 pb-5 flex flex-col gap-5">
        <p className="text-sm text-navy-600">
          {reservation.studentId && isBaptism
            ? "Vol baptême (choisi à la réservation) : les heures comptent, mais rien ne sera débité."
            : reservation.studentId
            ? `Le compte de ${personName(reservation.student) || "ce pilote"} sera débité automatiquement.`
            : reservation.priceCents != null
            ? `Forfait de ${formatMoney(reservation.priceCents)} à encaisser sur place (aucun compte à débiter).`
            : "Vol sans compte pilote associé (aucun débit)."}
        </p>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2">
            <Field label="Date du vol">
              <input
                type="date"
                required
                value={flightDate}
                onChange={(e) => setFlightDate(e.target.value)}
                className="input h-10 px-2"
              />
            </Field>
            <Field label="Départ">
              <input
                type="time"
                required
                value={departureClock}
                onChange={(e) => setDepartureClock(e.target.value)}
                className="input h-10 px-2"
              />
            </Field>
            <Field label="Arrivée">
              <input
                type="time"
                required
                value={arrivalClock}
                onChange={(e) => setArrivalClock(e.target.value)}
                className="input h-10 px-2"
              />
            </Field>
          </div>
          {departure && arrival && durationMs <= 0 ? (
            <p className="text-xs font-medium text-red-600">L&apos;heure d&apos;arrivée doit être après l&apos;heure de départ.</p>
          ) : duration > 0 ? (
            <p className="text-xs text-navy-500">Durée du vol : {formatHoursMinutes(duration)}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Terrain de départ">
            <input
              required
              placeholder="ex : LFNA"
              value={departureAirfield}
              onChange={(e) => setDepartureAirfield(e.target.value.toUpperCase())}
              maxLength={12}
              className="input h-10 uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
            />
          </Field>
          <Field label="Terrain d'arrivée">
            <input
              required
              placeholder="ex : LFNA"
              value={arrivalAirfield}
              onChange={(e) => setArrivalAirfield(e.target.value.toUpperCase())}
              maxLength={12}
              className="input h-10 uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          {stops.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_88px_32px] gap-2 px-0.5">
                <span className="text-xs font-medium text-navy-600">Terrain posé (OACI)</span>
                <span className="text-xs font-medium text-navy-600">Touchés</span>
                <span />
              </div>
              {stops.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_88px_32px] gap-2 items-center">
                  <input
                    required
                    placeholder="ex : LFNA"
                    value={s.airfield}
                    onChange={(e) => updateStop(i, { airfield: e.target.value.toUpperCase() })}
                    maxLength={12}
                    className="input h-10 uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
                  />
                  <input
                    type="number"
                    min={1}
                    value={s.touchAndGo}
                    onChange={(e) => updateStop(i, { touchAndGo: e.target.value })}
                    className="input h-10"
                  />
                  <button
                    type="button"
                    onClick={() => removeStop(i)}
                    aria-label="Retirer ce terrain"
                    className="h-8 w-8 grid place-items-center rounded-full text-navy-500 hover:bg-red-100 hover:text-red-600"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addStop}
            className="self-start flex items-center gap-1.5 text-sm font-medium text-sunset-600 hover:text-sunset-500"
          >
            <Plus size={15} /> Tours de piste ou touchés en route
          </button>
          {stops.length === 0 && (
            <p className="text-xs text-navy-500 -mt-1">
              Rien à ajouter pour un vol direct : l&apos;atterrissage à l&apos;arrivée est compté d&apos;office.
            </p>
          )}
        </div>

        {crewOpen ? (
          <div className="flex flex-col gap-3">
            <Field label="Instructeur">
              <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input h-10">
                <option value="">Aucun — vol seul</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {personName(i)}
                  </option>
                ))}
              </select>
            </Field>
            {reservation.type === "INSTRUCTION" && programs.length > 0 && (
              <Field label="Tarif d'instruction (formation)">
                <select
                  value={trainingProgramId}
                  onChange={(e) => setTrainingProgramId(e.target.value)}
                  className="input h-10"
                >
                  <option value="">Tarif par défaut de l&apos;instructeur</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.instructionRateCents ? ` — ${formatMoney(p.instructionRateCents)}/h` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3 rounded-xl bg-navy-50/80 px-3.5 py-2.5">
            <div className="text-sm text-navy-700 min-w-0">
              <p>
                {selectedInstructor ? (
                  <>
                    Instructeur : <span className="font-semibold text-navy-900">{personName(selectedInstructor)}</span>
                  </>
                ) : (
                  "Vol sans instructeur"
                )}
              </p>
              {isInstructionFlight && <p className="text-xs text-navy-500 mt-0.5">Tarif d&apos;instruction : {rateText}</p>}
            </div>
            <button
              type="button"
              onClick={() => setCrewOpen(true)}
              className="shrink-0 text-xs font-semibold text-sunset-600 hover:text-sunset-500"
            >
              Modifier
            </button>
          </div>
        )}

        <Field label="Remarques (facultatif)">
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input h-10" />
        </Field>

        <div className={clsx("rounded-xl border transition-colors", fuelRefillDone ? "border-navy-200" : "border-navy-100")}>
          <label className="flex items-center gap-2.5 px-3.5 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={fuelRefillDone}
              onChange={(e) => setFuelRefillDone(e.target.checked)}
              className="h-4 w-4 accent-navy-800"
            />
            <Fuel size={15} className="text-navy-500" />
            <span className="text-sm font-medium text-navy-800">Plein de carburant effectué</span>
          </label>
          {fuelRefillDone && (
            <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-3 border-t border-navy-100 pt-3">
              <Field label="Carte utilisée">
                <select value={fuelCard} onChange={(e) => setFuelCard(e.target.value)} className="input h-10">
                  {FUEL_CARD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Carburant">
                <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="input h-10">
                  {FUEL_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Litres">
                <input
                  required={fuelRefillDone}
                  type="number"
                  step="0.1"
                  min={0}
                  value={fuelLiters}
                  onChange={(e) => setFuelLiters(e.target.value)}
                  className="input h-10"
                />
              </Field>
              <Field label="Terrain (OACI)">
                <input
                  required={fuelRefillDone}
                  placeholder="ex : LFNA"
                  value={fuelAirfield}
                  onChange={(e) => setFuelAirfield(e.target.value.toUpperCase())}
                  maxLength={12}
                  className="input h-10 uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
                />
              </Field>
            </div>
          )}
        </div>

        {duration > 0 && (
          <div className="rounded-xl bg-navy-50/80 px-3.5 py-3 text-sm flex flex-col gap-1">
            <div className="flex justify-between gap-3 text-navy-700">
              <span>
                Avion — {formatHoursMinutes(duration)} × {formatMoney(aircraftRateCents)}/h
              </span>
              <span>{formatMoney(aircraftCostCents)}</span>
            </div>
            {isInstructionFlight && (
              <div className="flex justify-between gap-3 text-navy-700">
                <span>
                  Instruction
                  {instructionRateCents
                    ? ` — ${formatHoursMinutes(duration)} × ${formatMoney(instructionRateCents)}/h`
                    : " (aucun tarif renseigné)"}
                </span>
                <span>{formatMoney(instructionCostCents)}</span>
              </div>
            )}
            {reservation.studentId && isBaptism ? (
              <div className="flex justify-between gap-3 font-semibold text-green-700 border-t border-navy-100 pt-1.5 mt-1">
                <span>Vol baptême — aucun débit (coût indicatif)</span>
                <span>{formatMoney(totalCostCents)}</span>
              </div>
            ) : reservation.studentId ? (
              <div className="flex justify-between gap-3 font-semibold text-red-600 border-t border-navy-100 pt-1.5 mt-1">
                <span>Total débité du compte pilote</span>
                <span>− {formatMoney(totalCostCents)}</span>
              </div>
            ) : (
              <div className="flex justify-between gap-3 font-semibold text-navy-500 border-t border-navy-100 pt-1.5 mt-1">
                <span>Coût interne avion (indicatif)</span>
                <span>{formatMoney(aircraftCostCents)}</span>
              </div>
            )}
          </div>
        )}

        <ErrorLine message={error} />
      </div>

      <SheetFooter>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-navy-600 hover:text-navy-900">
          Retour
        </button>
        <button
          type="submit"
          disabled={saving || duration <= 0}
          className="ml-auto flex items-center gap-2 rounded-xl bg-navy-800 hover:bg-navy-900 text-white font-semibold px-4 h-10 text-sm transition-colors disabled:opacity-60"
        >
          <PlaneLanding size={16} />
          {saving
            ? "Clôture…"
            : reservation.studentId && isBaptism
            ? "Clôturer (sans débit)"
            : reservation.studentId
            ? "Clôturer et débiter"
            : "Clôturer le vol"}
        </button>
      </SheetFooter>
    </form>
  );
}
