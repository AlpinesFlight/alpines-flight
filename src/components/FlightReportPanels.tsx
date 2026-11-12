"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { PlaneTakeoff, PlaneLanding, Plus, X, Fuel } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Reservation, TrainingProgram, TrainingProgramLite, UserLite } from "@/types/models";
import { formatMoney, formatHoursMinutes, durationHours } from "@/lib/format";
import {
  INSTRUCTOR_RATE,
  combineDateTime,
  instructionRateFor,
  personName,
  programIdToSave,
  toDateInput,
  toTimeInput,
} from "@/lib/reservation-form";
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

// Choix du tarif d'instruction, partagé par la réservation et le
// compte-rendu : chaque formation avec son tarif, plus le tarif propre de
// l'instructeur choisi s'il en a un. Valeur "" = rien de connu, à choisir.
export function InstructionRateSelect({
  value,
  onChange,
  programs,
  extraProgram,
  instructor,
}: {
  value: string;
  onChange: (value: string) => void;
  programs: TrainingProgram[];
  // Formation déjà enregistrée sur la réservation, gardée dans la liste
  // même si elle n'est plus proposée (désactivée depuis).
  extraProgram?: TrainingProgramLite | null;
  instructor: UserLite | null;
}) {
  const instructorRate = instructor?.instructorProfile?.hourlyRateCents ?? null;
  const options: { id: string; title: string; instructionRateCents: number | null }[] = [...programs];
  if (extraProgram && !options.some((p) => p.id === extraProgram.id)) options.push(extraProgram);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input h-10">
      {value === "" && (
        <option value="" disabled>
          Choisir…
        </option>
      )}
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
          {p.instructionRateCents ? ` — ${formatMoney(p.instructionRateCents)}/h` : ""}
        </option>
      ))}
      {instructorRate ? (
        <option value={INSTRUCTOR_RATE}>
          Tarif de {instructor?.firstName} — {formatMoney(instructorRate)}/h
        </option>
      ) : null}
    </select>
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
  pilotProgramId = null,
  onCancel,
  onCompleted,
}: {
  reservation: Reservation;
  instructors: UserLite[];
  programs: TrainingProgram[];
  // Formation en cours du pilote (inscription), pour proposer son tarif
  // d'instruction si un instructeur est ajouté au compte-rendu.
  pilotProgramId?: string | null;
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
  // Instructeur À BORD (c'est lui qui déclenche la facturation de
  // l'instruction), distinct du FI qui supervise un solo depuis le sol :
  // choisir un instructeur ici facture l'instruction, même si le vol avait
  // été réservé comme solo ou location (vol finalement fait en double).
  const isDiscovery = reservation.type === "DISCOVERY";
  const supervisor = reservation.type === "SOLO" ? reservation.instructor : null;
  const [onBoardId, setOnBoardId] = useState(reservation.type === "SOLO" ? "" : reservation.instructorId ?? "");
  // null = pas touché : tarif proposé d'office (voir autoRate plus bas).
  const [rateChoice, setRateChoice] = useState<string | null>(null);
  // Instructeur et tarif sont déjà connus depuis la réservation : résumés
  // sur une ligne, dépliés pour les corriger (ou d'office s'il manque le
  // tarif d'un vol avec instructeur).
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

  const onBoard = instructors.find((i) => i.id === onBoardId);
  // Un vol découverte n'a pas de compte élève à débiter : pas d'instruction.
  const isInstructionFlight = !isDiscovery && !!onBoardId;
  const instructorRateCents = onBoard?.instructorProfile?.hourlyRateCents ?? null;
  // Tarif proposé d'office : celui fixé à la réservation, sinon la
  // formation en cours du pilote, sinon le tarif propre de l'instructeur —
  // la plupart des instructeurs n'en ayant pas, sans formation le choix
  // devient obligatoire plutôt que de facturer l'instruction 0 €.
  const autoRate =
    reservation.trainingProgramId ||
    (reservation.type === "INSTRUCTION" && instructorRateCents ? INSTRUCTOR_RATE : "") ||
    pilotProgramId ||
    (instructorRateCents ? INSTRUCTOR_RATE : "");
  const rawRate = rateChoice ?? autoRate;
  const rateValue = rawRate === INSTRUCTOR_RATE && !instructorRateCents ? "" : rawRate;
  // + la formation de la réservation, au cas où elle ne serait plus proposée
  // dans la liste (formation désactivée depuis).
  const ratePrograms = reservation.trainingProgram ? [...programs, reservation.trainingProgram] : programs;
  const instructionRateCents = isInstructionFlight
    ? instructionRateFor(rateValue, ratePrograms, instructorRateCents)
    : null;
  const missingRate = isInstructionFlight && !instructionRateCents;
  const instructionCostCents =
    isInstructionFlight && instructionRateCents && duration > 0 ? Math.round(duration * instructionRateCents) : 0;
  const totalCostCents = aircraftCostCents + instructionCostCents;
  const crewExpanded = crewOpen || missingRate;

  const selectedProgram = programs.find((p) => p.id === rateValue) ?? (reservation.trainingProgram?.id === rateValue ? reservation.trainingProgram : null);
  const rateText = !instructionRateCents
    ? null
    : rateValue === INSTRUCTOR_RATE || !selectedProgram
    ? `tarif de ${onBoard?.firstName ?? "l'instructeur"}, ${formatMoney(instructionRateCents)}/h`
    : `${selectedProgram.title}, ${formatMoney(instructionRateCents)}/h`;

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
          // L'instructeur à bord, sinon (solo) celui qui supervise — il reste
          // rattaché au vol comme avant, sans instruction facturée.
          instructorId: onBoardId || supervisor?.id || null,
          instructionFlight: isInstructionFlight,
          trainingProgramId: isInstructionFlight ? programIdToSave(rateValue) : null,
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

        {crewExpanded ? (
          <div className="grid gap-3">
            <Field label={isDiscovery ? "Instructeur" : "Instructeur à bord"}>
              <select
                value={onBoardId}
                onChange={(e) => {
                  setOnBoardId(e.target.value);
                  setCrewOpen(true);
                }}
                className="input h-10"
              >
                <option value="">
                  {supervisor ? `Aucun — solo supervisé par ${supervisor.firstName}` : "Aucun — vol seul"}
                </option>
                {instructors
                  .filter((i) => i.id !== reservation.studentId)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {personName(i)}
                    </option>
                  ))}
              </select>
            </Field>
            {isInstructionFlight && (
              <Field label="Tarif d'instruction">
                <InstructionRateSelect
                  value={rateValue}
                  onChange={(v) => {
                    setRateChoice(v);
                    setCrewOpen(true);
                  }}
                  programs={programs}
                  extraProgram={reservation.trainingProgram ?? null}
                  instructor={onBoard ?? null}
                />
              </Field>
            )}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3 rounded-xl bg-navy-50/80 px-3.5 py-2.5">
            <div className="text-sm text-navy-700 min-w-0">
              <p>
                {onBoard ? (
                  <>
                    {isDiscovery ? "Instructeur" : "Instructeur à bord"} :{" "}
                    <span className="font-semibold text-navy-900">{personName(onBoard)}</span>
                  </>
                ) : supervisor ? (
                  <>
                    Solo supervisé par <span className="font-semibold text-navy-900">{personName(supervisor)}</span>
                  </>
                ) : (
                  "Vol sans instructeur"
                )}
              </p>
              {isInstructionFlight && rateText && (
                <p className="text-xs text-navy-500 mt-0.5">Instruction : {rateText}</p>
              )}
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

        {missingRate && (
          <p className="text-sm rounded-xl px-3 py-2 text-navy-600 bg-navy-50">
            Choisis le tarif d&apos;instruction : {onBoard?.firstName ?? "cet instructeur"} n&apos;a pas de tarif propre
            renseigné.
          </p>
        )}
        <ErrorLine message={error} />
      </div>

      <SheetFooter>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-navy-600 hover:text-navy-900">
          Retour
        </button>
        <button
          type="submit"
          disabled={saving || duration <= 0 || missingRate}
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
