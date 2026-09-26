"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Aircraft, FlightLog, ReservationType, TrainingProgram, UserLite } from "@/types/models";
import { durationHours, formatDate, formatHours, formatHoursMinutes, formatMoney } from "@/lib/format";
import { Pencil, Plus, PlaneLanding, Trash2, X } from "lucide-react";

function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function firstOfMonthIso(): string {
  const d = new Date();
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

// Le jour 0 du mois suivant = le dernier jour du mois en cours — filtre
// par défaut sur le mois entier plutôt que "1er du mois → aujourd'hui",
// qui ne montrait presque rien en tout début de mois (le 1er, ça ne
// couvrait qu'une seule journée).
function lastOfMonthIso(): string {
  const d = new Date();
  return toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const FUEL_CARD_OPTIONS = [
  { value: "BP", label: "BP" },
  { value: "TOTAL", label: "Total" },
  { value: "BADGE_TALLARD", label: "Badge Tallard" },
];
const FUEL_TYPE_OPTIONS = [
  { value: "AVGAS_100LL", label: "Avgas 100LL" },
  { value: "SP98", label: "SP98" },
];
const FUEL_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FUEL_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

export function FlightsView() {
  const { data: session } = useSession();
  // Modifier/supprimer un vol touche directement le débit du compte pilote —
  // réservé au Gérant, comme le reste des finances (voir src/lib/permissions.ts).
  const canFinanceAdmin = session?.user?.role === "GERANT";
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(searchParams.get("from") ?? firstOfMonthIso());
  const [to, setTo] = useState(searchParams.get("to") ?? lastOfMonthIso());
  const [flights, setFlights] = useState<FlightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editFlight, setEditFlight] = useState<FlightLog | null>(null);
  const [showAddFlight, setShowAddFlight] = useState(false);

  async function load(f: string, t: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f) params.set("from", f);
      if (t) params.set("to", t);
      const data = await apiFetch<FlightLog[]>(`/api/flights?${params.toString()}`);
      setFlights(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    router.replace(`/vols?from=${from}&to=${to}`);
    load(from, to);
  }

  async function handleDelete(f: FlightLog) {
    if (
      !window.confirm(
        `Supprimer ce vol (${f.aircraft.registration}, ${formatDate(f.date)}, ${formatHoursMinutes(f.duration)}) ? Le solde du pilote, les heures de l'avion et la réservation d'origine seront réajustés en conséquence.`
      )
    )
      return;
    await apiFetch(`/api/flights/${f.id}`, { method: "DELETE" });
    load(from, to);
  }

  const summary = useMemo(() => {
    const totalHours = flights.reduce((s, f) => s + f.duration, 0);
    const totalLandings = flights.reduce((s, f) => s + f.totalLandings, 0);
    const totalRevenue = flights.reduce((s, f) => s + f.aircraftCostCents + f.instructionCostCents, 0);
    return { count: flights.length, totalHours, totalLandings, totalRevenue };
  }, [flights]);

  // Résumé de gestion (Gérant uniquement) — heures/CA par avion, conso
  // carburant par type, et atterrissages par terrain (taxes d'atterrissage).
  // Calculé uniquement à partir de ce qui est déjà chargé (flights), aucun
  // appel supplémentaire.
  const managementSummary = useMemo(() => {
    const byAircraft = new Map<string, { registration: string; hours: number; landings: number; revenueCents: number }>();
    const fuelByType = new Map<string, number>();
    const landingsByAirfield = new Map<string, number>();

    for (const f of flights) {
      const ac = byAircraft.get(f.aircraft.registration) ?? {
        registration: f.aircraft.registration,
        hours: 0,
        landings: 0,
        revenueCents: 0,
      };
      ac.hours += f.duration;
      ac.landings += f.totalLandings;
      ac.revenueCents += f.aircraftCostCents + f.instructionCostCents;
      byAircraft.set(f.aircraft.registration, ac);

      if (f.fuelRefillDone && f.fuelLiters && f.fuelType) {
        fuelByType.set(f.fuelType, (fuelByType.get(f.fuelType) ?? 0) + f.fuelLiters);
      }

      // Reconstruit qui a atterri où (indépendamment du seul totalLandings
      // cumulé) : l'arrivée compte pour 1 atterrissage, chaque terrain de
      // stop intermédiaire pour son nombre de touchés — voir la même règle
      // appliquée à la clôture du vol, /api/reservations/[id]/complete.
      if (f.arrivalAirfield) {
        landingsByAirfield.set(f.arrivalAirfield, (landingsByAirfield.get(f.arrivalAirfield) ?? 0) + 1);
      }
      for (const stop of f.stops) {
        landingsByAirfield.set(stop.airfield, (landingsByAirfield.get(stop.airfield) ?? 0) + stop.touchAndGo);
      }
    }

    return {
      byAircraft: Array.from(byAircraft.values()).sort((a, b) => b.hours - a.hours),
      fuelByType: Array.from(fuelByType.entries()).sort((a, b) => b[1] - a[1]),
      landingsByAirfield: Array.from(landingsByAirfield.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [flights]);

  return (
    <div className="p-4 md:p-8">
      <form onSubmit={applyRange} className="flex items-end gap-3 mb-5 flex-wrap">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-navy-600">Du</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-navy-600">Au</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-4 py-2 transition-colors"
        >
          Filtrer
        </button>
        {canFinanceAdmin && (
          <button
            type="button"
            onClick={() => setShowAddFlight(true)}
            className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-900 text-white text-sm font-semibold px-4 py-2 transition-colors ml-auto"
          >
            <Plus size={16} /> Ajouter un vol antérieur
          </button>
        )}
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <SummaryTile label="Vols" value={String(summary.count)} />
        <SummaryTile label="Heures de vol" value={formatHours(summary.totalHours)} />
        <SummaryTile label="Atterrissages" value={String(summary.totalLandings)} />
        <SummaryTile label="Chiffre d'affaires" value={formatMoney(summary.totalRevenue)} />
      </div>

      {/* Résumé de gestion — Gérant uniquement, sur cette même page plutôt
          qu'une nouvelle sous-page (voir Sidebar.tsx, déjà chargée). */}
      {canFinanceAdmin && (
        <div className="mb-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-navy-900">Résumé de gestion</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-navy-100 p-4">
              <h3 className="text-xs font-semibold text-navy-600 mb-3">Par avion</h3>
              <div className="flex flex-col gap-2">
                {managementSummary.byAircraft.map((a) => (
                  <div key={a.registration} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-navy-900 whitespace-nowrap">{a.registration}</span>
                    <span className="text-navy-600 text-right">
                      {formatHours(a.hours)} · {a.landings} att. · {formatMoney(a.revenueCents)}
                    </span>
                  </div>
                ))}
                {managementSummary.byAircraft.length === 0 && (
                  <p className="text-xs text-navy-500">Aucune donnée sur cette période.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-navy-100 p-4">
              <h3 className="text-xs font-semibold text-navy-600 mb-3">Carburant consommé</h3>
              <div className="flex flex-col gap-2">
                {managementSummary.fuelByType.map(([type, liters]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-navy-900">{FUEL_TYPE_LABEL[type] ?? type}</span>
                    <span className="text-navy-600">{liters.toFixed(1)} L</span>
                  </div>
                ))}
                {managementSummary.fuelByType.length === 0 && (
                  <p className="text-xs text-navy-500">Aucun plein enregistré sur cette période.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-navy-100 p-4">
              <h3 className="text-xs font-semibold text-navy-600 mb-3">
                Atterrissages par terrain <span className="font-normal text-navy-400">(taxes)</span>
              </h3>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                {managementSummary.landingsByAirfield.map(([field, count]) => (
                  <div key={field} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-navy-900">{field}</span>
                    <span className="text-navy-600">{count}</span>
                  </div>
                ))}
                {managementSummary.landingsByAirfield.length === 0 && (
                  <p className="text-xs text-navy-500">Aucun atterrissage sur cette période.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-navy-600 border-b border-navy-100">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Avion</th>
              <th className="px-5 py-3 font-medium">Élève</th>
              <th className="px-5 py-3 font-medium">Instructeur</th>
              <th className="px-5 py-3 font-medium">Formation</th>
              <th className="px-5 py-3 font-medium">Trajet</th>
              <th className="px-5 py-3 font-medium text-right">Durée</th>
              <th className="px-5 py-3 font-medium text-right">Att.</th>
              <th className="px-5 py-3 font-medium text-right">Coût</th>
              {canFinanceAdmin && <th className="px-5 py-3 font-medium" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {flights.map((f) => (
              <tr key={f.id} className="group hover:bg-navy-50/50 transition-colors">
                <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{formatDate(f.date)}</td>
                <td className="px-5 py-3 font-medium text-navy-900 whitespace-nowrap">{f.aircraft.registration}</td>
                <td className="px-5 py-3 text-navy-700">
                  {f.student ? `${f.student.firstName} ${f.student.lastName}` : "—"}
                </td>
                <td className="px-5 py-3 text-navy-700">
                  {f.instructor ? `${f.instructor.firstName} ${f.instructor.lastName}` : "—"}
                </td>
                <td className="px-5 py-3 text-navy-500 text-xs">{f.trainingProgram?.title ?? "—"}</td>
                <td className="px-5 py-3 text-navy-700 text-xs whitespace-nowrap">
                  {f.departureAirfield && f.arrivalAirfield
                    ? `${f.departureAirfield} → ${f.arrivalAirfield}`
                    : "—"}
                </td>
                <td className="px-5 py-3 text-right text-navy-700 whitespace-nowrap">{formatHoursMinutes(f.duration)}</td>
                <td className="px-5 py-3 text-right text-navy-700">{f.totalLandings}</td>
                <td className="px-5 py-3 text-right font-semibold text-navy-900 whitespace-nowrap">
                  {formatMoney(f.aircraftCostCents + f.instructionCostCents)}
                  {f.isBaptism && (
                    <span
                      title="Vol baptême — coût indicatif, non débité"
                      className="ml-1.5 align-middle text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    >
                      Baptême
                    </span>
                  )}
                </td>
                {canFinanceAdmin && (
                  <td className="px-5 py-3">
                    {/* Visible d'office sur écran tactile : sans souris, le survol
                        n'existe pas et les boutons resteraient invisibles. */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditFlight(f)}
                        title="Modifier"
                        className="text-navy-500 hover:text-navy-900 hover:bg-navy-100 rounded-lg p-1.5"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(f)}
                        title="Supprimer"
                        className="text-navy-500 hover:text-red-600 hover:bg-red-100 rounded-lg p-1.5"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!loading && flights.length === 0 && (
              <tr>
                <td colSpan={canFinanceAdmin ? 10 : 9} className="px-5 py-8 text-center text-navy-600">
                  Aucun vol sur cette période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {editFlight && (
        <EditFlightModal
          flight={editFlight}
          onClose={() => setEditFlight(null)}
          onSaved={() => {
            setEditFlight(null);
            load(from, to);
          }}
        />
      )}

      {showAddFlight && (
        <AddFlightModal
          onClose={() => setShowAddFlight(false)}
          onSaved={() => {
            setShowAddFlight(false);
            load(from, to);
          }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 p-4">
      <p className="text-xl font-bold text-navy-900 leading-tight">{value}</p>
      <p className="text-xs text-navy-600">{label}</p>
    </div>
  );
}

function centsToInput(cents: number) {
  return String(Math.round(cents) / 100);
}

// Corrige un vol déjà clôturé, depuis la page Vols — tout ce que le
// compte-rendu de vol permettait de saisir (avion, pilote, instructeur,
// formation, horaires, terrains, atterrissages, montants, carburant) sans
// repasser par le planning. Le serveur répercute les changements sur les
// heures/cycles des avions, le compte du pilote et la réservation d'origine
// (voir PATCH /api/flights/[id]) ; les montants sont ceux affichés ici.
function EditFlightModal({
  flight,
  onClose,
  onSaved,
}: {
  flight: FlightLog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([]);
  const [students, setStudents] = useState<UserLite[]>([]);
  const [instructors, setInstructors] = useState<UserLite[]>([]);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [aircraftId, setAircraftId] = useState(flight.aircraftId);
  const [studentId, setStudentId] = useState(flight.studentId ?? "");
  const [instructorId, setInstructorId] = useState(flight.instructorId ?? "");
  // Le type de vol n'est pas conservé sur le vol : une instruction facturée se
  // reconnaît à son coût ou à sa formation (un instructeur simplement
  // rattaché à un vol solo n'en facture pas).
  const [billInstruction, setBillInstruction] = useState(
    flight.instructionCostCents > 0 || !!flight.trainingProgramId
  );
  const [trainingProgramId, setTrainingProgramId] = useState(flight.trainingProgramId ?? "");
  const [departureTime, setDepartureTime] = useState(toLocalInput(new Date(flight.departureTime)));
  const [arrivalTime, setArrivalTime] = useState(toLocalInput(new Date(flight.arrivalTime)));
  const [departureAirfield, setDepartureAirfield] = useState(flight.departureAirfield ?? "");
  const [arrivalAirfield, setArrivalAirfield] = useState(flight.arrivalAirfield ?? "");
  const [initialStops] = useState<StopRow[]>(() =>
    flight.stops.map((s) => ({ airfield: s.airfield, touchAndGo: String(s.touchAndGo) }))
  );
  const [stops, setStops] = useState<StopRow[]>(initialStops);
  const [totalLandings, setTotalLandings] = useState(String(flight.totalLandings));
  const [remarks, setRemarks] = useState(flight.remarks ?? "");
  const [aircraftCost, setAircraftCost] = useState(centsToInput(flight.aircraftCostCents));
  const [instructionCost, setInstructionCost] = useState(centsToInput(flight.instructionCostCents));
  // "Auto" : le montant suit le tarif calculé (avion : durée × tarif du
  // pilote sur cet avion ; instruction : durée × tarif de la formation ou de
  // l'instructeur). Activé quand on change ce dont il dépend (avion/pilote,
  // instructeur/formation), coupé dès qu'on saisit le montant à la main.
  const [aircraftAuto, setAircraftAuto] = useState(false);
  const [instructionAuto, setInstructionAuto] = useState(false);
  const [timesTouched, setTimesTouched] = useState(false);
  const [fuelRefillDone, setFuelRefillDone] = useState(flight.fuelRefillDone);
  const [fuelCard, setFuelCard] = useState(flight.fuelCard ?? "BP");
  const [fuelLiters, setFuelLiters] = useState(flight.fuelLiters ? String(flight.fuelLiters) : "");
  const [fuelType, setFuelType] = useState(flight.fuelType ?? "AVGAS_100LL");
  const [fuelAirfield, setFuelAirfield] = useState(flight.fuelAirfield ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Aircraft[]>("/api/aircraft"),
      apiFetch<UserLite[]>("/api/students"),
      apiFetch<UserLite[]>("/api/instructors"),
      // all=true : la formation du vol peut avoir été désactivée depuis.
      apiFetch<TrainingProgram[]>("/api/training/programs?all=true"),
    ])
      .then(([ac, stu, ins, pr]) => {
        setAircraftList(ac);
        setStudents(stu);
        setInstructors(ins);
        setPrograms(pr);
      })
      .finally(() => setLoadingRefs(false));
  }, []);

  // Tarif avion réellement applicable (dérogation du pilote incluse, voir
  // PilotAircraftRate) — indexé par avion|pilote pour ne jamais utiliser le
  // tarif d'une autre combinaison le temps que la réponse arrive.
  const [rate, setRate] = useState<{ key: string; cents: number } | null>(null);
  useEffect(() => {
    if (!aircraftId) return;
    let cancelled = false;
    const key = `${aircraftId}|${studentId}`;
    const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
    apiFetch<{ rateCents: number }>(`/api/aircraft/${aircraftId}/effective-rate${qs}`)
      .then((r) => {
        if (!cancelled) setRate({ key, cents: r.rateCents });
      })
      .catch(() => {
        // Sans tarif, aucun montant n'est proposé : on garde ceux saisis.
      });
    return () => {
      cancelled = true;
    };
  }, [aircraftId, studentId]);

  const durationMs = new Date(arrivalTime).getTime() - new Date(departureTime).getTime();
  const duration = durationMs > 0 ? durationHours(new Date(departureTime), new Date(arrivalTime)) : 0;

  const aircraftRateCents = rate && rate.key === `${aircraftId}|${studentId}` ? rate.cents : null;
  const suggestedAircraftCents =
    aircraftRateCents != null && duration > 0 ? Math.round(duration * aircraftRateCents) : null;
  const selectedProgram = programs.find((p) => p.id === trainingProgramId);
  const selectedInstructor = instructors.find((i) => i.id === instructorId);
  const instructionRateCents =
    selectedProgram?.instructionRateCents ?? selectedInstructor?.instructorProfile?.hourlyRateCents ?? null;
  const instructionBilled = !!instructorId && billInstruction;
  const suggestedInstructionCents =
    loadingRefs || duration <= 0
      ? null
      : instructionBilled && instructionRateCents
        ? Math.round(duration * instructionRateCents)
        : 0;

  const aircraftCostShown =
    aircraftAuto && suggestedAircraftCents != null ? centsToInput(suggestedAircraftCents) : aircraftCost;
  const instructionCostShown =
    instructionAuto && suggestedInstructionCents != null ? centsToInput(suggestedInstructionCents) : instructionCost;
  const aircraftCents = Math.round(parseFloat(aircraftCostShown) * 100) || 0;
  const instructionCents = Math.round(parseFloat(instructionCostShown) * 100) || 0;
  // Après un changement d'horaire, propose (sans l'imposer) le montant au
  // tarif actuel s'il diffère de celui saisi.
  const aircraftHint =
    timesTouched && !aircraftAuto && suggestedAircraftCents != null && suggestedAircraftCents !== aircraftCents
      ? suggestedAircraftCents
      : null;
  const instructionHint =
    timesTouched && !instructionAuto && suggestedInstructionCents != null && suggestedInstructionCents !== instructionCents
      ? suggestedInstructionCents
      : null;

  // Liste des sélecteurs : le pilote / l'instructeur / la formation actuels
  // restent proposés même s'ils ne sont plus dans les listes (compte d'un
  // autre rôle, formation désactivée...).
  const knownUserIds = new Set([...students, ...instructors].map((u) => u.id));
  const extraPilot = flight.student && !knownUserIds.has(flight.student.id) ? flight.student : null;
  const extraInstructor =
    flight.instructor && !instructors.some((i) => i.id === flight.instructor!.id) ? flight.instructor : null;
  const programOptions = programs.filter((p) => p.active || p.id === flight.trainingProgramId);
  const aircraftOptions = aircraftList.some((a) => a.id === flight.aircraftId)
    ? aircraftList
    : [flight.aircraft, ...aircraftList];

  const userName = (id: string) => {
    const u = [...students, ...instructors, ...(flight.student ? [flight.student] : []), ...(flight.instructor ? [flight.instructor] : [])].find(
      (x) => x.id === id
    );
    return u ? `${u.firstName} ${u.lastName}` : "—";
  };
  const registrationOf = (id: string) =>
    aircraftOptions.find((a) => a.id === id)?.registration ?? flight.aircraft.registration;

  function handleAircraftChange(id: string) {
    setAircraftId(id);
    setAircraftAuto(true);
  }
  function handlePilotChange(id: string) {
    setStudentId(id);
    setAircraftAuto(true);
  }
  function handleInstructorChange(id: string) {
    setInstructorId(id);
    setInstructionAuto(true);
    // Ajouter un instructeur à un vol qui n'en avait pas : c'est presque
    // toujours une instruction à facturer — décochable juste en dessous.
    if (id && !flight.instructorId) setBillInstruction(true);
  }
  function handleTimesChange(setter: (v: string) => void, value: string) {
    setter(value);
    setTimesTouched(true);
  }
  function changeStops(next: StopRow[]) {
    setStops(next);
    // Atterrissage final compté d'office, comme à la clôture du vol.
    setTotalLandings(String(next.reduce((sum, s) => sum + (parseInt(s.touchAndGo, 10) || 0), 0) + 1));
  }

  const normalizeStops = (rows: StopRow[]) =>
    rows
      .filter((s) => s.airfield.trim())
      .map((s) => ({ airfield: s.airfield.trim().toUpperCase(), touchAndGo: parseInt(s.touchAndGo, 10) || 1 }));
  const stopsChanged = JSON.stringify(normalizeStops(stops)) !== JSON.stringify(normalizeStops(initialStops));

  const nextProgramId = instructionBilled ? trainingProgramId || null : null;
  const aircraftChanged = aircraftId !== flight.aircraftId;
  const pilotChanged = studentId !== (flight.studentId ?? "");
  const instructorChanged = instructorId !== (flight.instructorId ?? "");
  const programChanged = nextProgramId !== (flight.trainingProgramId ?? null);

  const oldTotalCents = flight.aircraftCostCents + flight.instructionCostCents;
  const newTotalCents = aircraftCents + instructionCents;
  const landingsCount = parseInt(totalLandings, 10) || 0;
  const impacts: React.ReactNode[] = [];
  if (aircraftChanged) {
    impacts.push(
      <>
        Les {formatHoursMinutes(duration)} de vol et {landingsCount} atterrissage{landingsCount > 1 ? "s" : ""} passent
        de <span className="whitespace-nowrap">{flight.aircraft.registration}</span> à{" "}
        <span className="whitespace-nowrap">{registrationOf(aircraftId)}</span> (heures, cycles et échéances
        maintenance des deux avions).
      </>
    );
  }
  if (pilotChanged) {
    if (flight.isBaptism) {
      impacts.push("Vol baptême : aucun débit, seules les heures passent d'un pilote à l'autre.");
    } else {
      const parts: string[] = [];
      if (flight.studentId) parts.push(`${userName(flight.studentId)} est recrédité de ${formatMoney(oldTotalCents)}`);
      if (studentId) parts.push(`${userName(studentId)} est débité de ${formatMoney(newTotalCents)}`);
      impacts.push(`Compte pilote : ${parts.join(" ; ")}.`);
    }
  } else if (studentId && !flight.isBaptism && newTotalCents !== oldTotalCents) {
    const delta = newTotalCents - oldTotalCents;
    impacts.push(
      `Compte de ${userName(studentId)} : ${delta > 0 ? "débit supplémentaire" : "remboursement"} de ${formatMoney(Math.abs(delta))}.`
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/flights/${flight.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(aircraftChanged ? { aircraftId } : {}),
          ...(pilotChanged ? { studentId: studentId || null } : {}),
          ...(instructorChanged ? { instructorId: instructorId || null } : {}),
          ...(programChanged ? { trainingProgramId: nextProgramId } : {}),
          departureTime: new Date(departureTime).toISOString(),
          arrivalTime: new Date(arrivalTime).toISOString(),
          departureAirfield: departureAirfield.trim().toUpperCase() || null,
          arrivalAirfield: arrivalAirfield.trim().toUpperCase() || null,
          totalLandings: landingsCount,
          ...(stopsChanged ? { stops: normalizeStops(stops) } : {}),
          remarks: remarks || null,
          aircraftCostCents: aircraftCents,
          instructionCostCents: instructionCents,
          fuelRefillDone,
          ...(fuelRefillDone
            ? { fuelCard, fuelLiters: parseFloat(fuelLiters) || null, fuelType, fuelAirfield: fuelAirfield || null }
            : {}),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-navy-900">
            Modifier le vol — <span className="whitespace-nowrap">{flight.aircraft.registration}</span> ·{" "}
            <span className="whitespace-nowrap">{formatDate(flight.date)}</span>
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {loadingRefs ? (
          <p className="p-5 text-sm text-navy-600">Chargement...</p>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
            <p className="text-xs text-navy-600 -mt-1">
              Tout se corrige ici : heures et cycles des avions, compte du pilote, échéances maintenance et créneau du
              planning suivent automatiquement.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Avion">
                <select value={aircraftId} onChange={(e) => handleAircraftChange(e.target.value)} className="input">
                  {aircraftOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.registration}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pilote (compte débité)">
                <select value={studentId} onChange={(e) => handlePilotChange(e.target.value)} className="input">
                  <option value="">— aucun (ex. vol maintenance) —</option>
                  <optgroup label="Élèves">
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Instructeurs">
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.firstName} {i.lastName}
                      </option>
                    ))}
                  </optgroup>
                  {extraPilot && (
                    <option value={extraPilot.id}>
                      {extraPilot.firstName} {extraPilot.lastName}
                    </option>
                  )}
                </select>
              </Field>
            </div>

            <Field label="Instructeur (si vol accompagné)">
              <select value={instructorId} onChange={(e) => handleInstructorChange(e.target.value)} className="input">
                <option value="">— vol seul —</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.firstName} {i.lastName}
                  </option>
                ))}
                {extraInstructor && (
                  <option value={extraInstructor.id}>
                    {extraInstructor.firstName} {extraInstructor.lastName}
                  </option>
                )}
              </select>
            </Field>

            {instructorId && (
              <div className="rounded-lg border border-navy-100">
                <label className="flex items-center gap-2 px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={billInstruction}
                    onChange={(e) => {
                      setBillInstruction(e.target.checked);
                      setInstructionAuto(true);
                    }}
                  />
                  <span className="text-sm font-medium text-navy-800">Instruction facturée au pilote</span>
                </label>
                {billInstruction && (
                  <div className="px-3 pb-3 border-t border-navy-100 pt-3">
                    <Field label="Formation (détermine le tarif d'instruction)">
                      <select
                        value={trainingProgramId}
                        onChange={(e) => {
                          setTrainingProgramId(e.target.value);
                          setInstructionAuto(true);
                        }}
                        className="input"
                      >
                        <option value="">— tarif par défaut de l&apos;instructeur —</option>
                        {programOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                            {p.instructionRateCents ? ` — ${formatMoney(p.instructionRateCents)}/h` : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Départ">
                <input
                  type="datetime-local"
                  required
                  value={departureTime}
                  onChange={(e) => handleTimesChange(setDepartureTime, e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Arrivée">
                <input
                  type="datetime-local"
                  required
                  value={arrivalTime}
                  onChange={(e) => handleTimesChange(setArrivalTime, e.target.value)}
                  className="input"
                />
              </Field>
            </div>
            <p className="text-xs text-navy-500 -mt-1.5">Durée recalculée : {formatHoursMinutes(duration)}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Terrain de départ (OACI)">
                <input
                  placeholder="ex : LFNA"
                  value={departureAirfield}
                  onChange={(e) => setDepartureAirfield(e.target.value.toUpperCase())}
                  maxLength={12}
                  className="input uppercase tracking-wide"
                />
              </Field>
              <Field label="Terrain de destination (OACI)">
                <input
                  placeholder="ex : LFNA"
                  value={arrivalAirfield}
                  onChange={(e) => setArrivalAirfield(e.target.value.toUpperCase())}
                  maxLength={12}
                  className="input uppercase tracking-wide"
                />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-navy-600">
                  Terrains posés (optionnel — tours de piste/touchés en route)
                </span>
                <button
                  type="button"
                  onClick={() => changeStops([...stops, { airfield: "", touchAndGo: "1" }])}
                  className="flex items-center gap-1 text-xs text-sunset-600 hover:underline"
                >
                  <Plus size={12} /> Ajouter un terrain
                </button>
              </div>
              {stops.length === 0 && (
                <p className="text-xs text-navy-500">Aucun terrain intermédiaire — seul l&apos;atterrissage à destination compte.</p>
              )}
              {stops.length > 0 && (
                <div className="grid grid-cols-[1fr_88px_auto] gap-2 mb-1 px-0.5">
                  <span className="text-[11px] text-navy-500">Code OACI</span>
                  <span className="text-[11px] text-navy-500">Touchés</span>
                  <span />
                </div>
              )}
              <div className="flex flex-col gap-2">
                {stops.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_88px_auto] gap-2 items-center">
                    <input
                      required
                      placeholder="ex : LFNA"
                      value={s.airfield}
                      onChange={(e) =>
                        changeStops(stops.map((x, j) => (j === i ? { ...x, airfield: e.target.value.toUpperCase() } : x)))
                      }
                      maxLength={12}
                      className="input uppercase tracking-wide"
                    />
                    <input
                      type="number"
                      min={1}
                      value={s.touchAndGo}
                      onChange={(e) => changeStops(stops.map((x, j) => (j === i ? { ...x, touchAndGo: e.target.value } : x)))}
                      className="input"
                    />
                    <button
                      type="button"
                      onClick={() => changeStops(stops.filter((_, j) => j !== i))}
                      className="text-navy-600 hover:text-red-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Field label="Atterrissages (cycles)">
              <input
                type="number"
                min={0}
                value={totalLandings}
                onChange={(e) => setTotalLandings(e.target.value)}
                className="input"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Field label="Coût avion (€)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={aircraftCostShown}
                    onChange={(e) => {
                      setAircraftCost(e.target.value);
                      setAircraftAuto(false);
                    }}
                    className="input"
                  />
                </Field>
                {aircraftHint != null && (
                  <button
                    type="button"
                    onClick={() => setAircraftAuto(true)}
                    className="text-left text-[11px] text-sunset-600 hover:underline"
                  >
                    Au tarif actuel : {formatMoney(aircraftHint)} — appliquer
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Field label="Coût instruction (€)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={instructionCostShown}
                    onChange={(e) => {
                      setInstructionCost(e.target.value);
                      setInstructionAuto(false);
                    }}
                    className="input"
                  />
                </Field>
                {instructionHint != null && (
                  <button
                    type="button"
                    onClick={() => setInstructionAuto(true)}
                    className="text-left text-[11px] text-sunset-600 hover:underline"
                  >
                    Au tarif actuel : {formatMoney(instructionHint)} — appliquer
                  </button>
                )}
              </div>
            </div>
            {flight.isBaptism && (
              <p className="text-xs text-green-700 -mt-1.5">Vol baptême : ces montants sont indicatifs, aucun débit du compte pilote.</p>
            )}

            <Field label="Remarques">
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input min-h-16" />
            </Field>

            <div className="rounded-lg border border-navy-100">
              <label className="flex items-center gap-2 px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={fuelRefillDone} onChange={(e) => setFuelRefillDone(e.target.checked)} />
                <span className="text-sm font-medium text-navy-800">Plein de carburant effectué</span>
              </label>
              {fuelRefillDone && (
                <div className="px-3 pb-3 flex flex-col gap-2 border-t border-navy-100 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select value={fuelCard} onChange={(e) => setFuelCard(e.target.value as typeof fuelCard)} className="input">
                      {FUEL_CARD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select value={fuelType} onChange={(e) => setFuelType(e.target.value as typeof fuelType)} className="input">
                      {FUEL_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      placeholder="Litres"
                      value={fuelLiters}
                      onChange={(e) => setFuelLiters(e.target.value)}
                      className="input"
                    />
                    <input
                      placeholder="Terrain (OACI)"
                      value={fuelAirfield}
                      onChange={(e) => setFuelAirfield(e.target.value.toUpperCase())}
                      className="input uppercase"
                    />
                  </div>
                </div>
              )}
            </div>

            {impacts.length > 0 && (
              <div className="rounded-lg bg-navy-50 px-3 py-2.5 text-xs text-navy-700 flex flex-col gap-1">
                {impacts.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}

            {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={saving || duration <= 0}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

interface StopRow {
  airfield: string;
  touchAndGo: string;
}

// DISCOVERY volontairement absent — un vol découverte se saisit depuis sa
// page dédiée (/decouverte), qui gère en plus le forfait client sans
// compte ; même choix que le formulaire de réservation (ReservationModal).
const FLIGHT_TYPE_OPTIONS: { value: ReservationType; label: string }[] = [
  { value: "INSTRUCTION", label: "Instruction" },
  { value: "SOLO", label: "Solo" },
  { value: "LOCATION", label: "Location" },
  { value: "MAINTENANCE", label: "Maintenance" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-navy-600">{label}</span>
      {children}
    </label>
  );
}

// Saisie directe d'un vol déjà effectué (rattrapage), sans passer par une
// réservation sur le planning — donc sans email envoyé (voir
// notifyReservation, déclenché uniquement à la création/modification d'une
// Reservation). Reprend les mêmes champs et le même calcul de coût que le
// compte-rendu normal d'un vol réservé (CompleteFlightPanel dans
// ReservationModal.tsx), avec en plus ce qu'une réservation aurait fourni
// (avion, pilote, type) puisqu'il n'y en a pas ici. Voir POST /api/flights.
function AddFlightModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([]);
  const [instructors, setInstructors] = useState<UserLite[]>([]);
  const [students, setStudents] = useState<UserLite[]>([]);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [aircraftId, setAircraftId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [type, setType] = useState<ReservationType>("SOLO");
  const [trainingProgramId, setTrainingProgramId] = useState("");
  const [departureTime, setDepartureTime] = useState(toLocalInput(new Date()));
  const [arrivalTime, setArrivalTime] = useState(toLocalInput(new Date()));
  // LFNA (Gap-Tallard) pré-rempli par défaut au départ, comme sur le
  // compte-rendu normal — la grande majorité des vols partent de la base.
  const [departureAirfield, setDepartureAirfield] = useState("LFNA");
  const [arrivalAirfield, setArrivalAirfield] = useState("");
  // Vide par défaut, contrairement à CompleteFlightPanel : ce champ ne sert
  // qu'aux touchés intermédiaires (tours de piste...), pas à l'atterrissage
  // final (déjà compté via le +1 côté serveur, voir POST /api/flights) — un
  // vol simple d'un point A à B n'a donc légitimement rien à y mettre, et ne
  // doit pas être bloqué faute de terrain "posé" à renseigner.
  const [stops, setStops] = useState<StopRow[]>([]);
  const [remarks, setRemarks] = useState("");
  const [fuelRefillDone, setFuelRefillDone] = useState(false);
  const [fuelCard, setFuelCard] = useState("BP");
  const [fuelLiters, setFuelLiters] = useState("");
  const [fuelType, setFuelType] = useState("AVGAS_100LL");
  const [fuelAirfield, setFuelAirfield] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Aircraft[]>("/api/aircraft"),
      apiFetch<UserLite[]>("/api/instructors"),
      apiFetch<UserLite[]>("/api/students"),
      apiFetch<TrainingProgram[]>("/api/training/programs"),
    ])
      .then(([ac, ins, stu, pr]) => {
        setAircraftList(ac);
        setInstructors(ins);
        setStudents(stu);
        setPrograms(pr);
        if (ac[0]) setAircraftId(ac[0].id);
      })
      .finally(() => setLoadingRefs(false));
  }, []);

  const selectedAircraft = aircraftList.find((a) => a.id === aircraftId);
  // Tarif avion réellement applicable — dérogation pilote éventuelle
  // incluse (voir PilotAircraftRate) : affiché tout de suite avec le tarif
  // standard de l'avion sélectionné, puis affiné dès la réponse du serveur.
  // Le calcul déterminant se refait de toute façon côté serveur à
  // l'enregistrement (jamais transmis dans le POST ci-dessous).
  const [aircraftRateCents, setAircraftRateCents] = useState<number | null>(null);
  useEffect(() => {
    setAircraftRateCents(selectedAircraft?.hourlyRateCents ?? null);
    if (!aircraftId) return;
    let cancelled = false;
    const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
    apiFetch<{ rateCents: number }>(`/api/aircraft/${aircraftId}/effective-rate${qs}`)
      .then((r) => {
        if (!cancelled) setAircraftRateCents(r.rateCents);
      })
      .catch(() => {
        // Best-effort : en cas d'échec, on garde le tarif standard déjà affiché.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraftId, studentId]);

  const durationMs = new Date(arrivalTime).getTime() - new Date(departureTime).getTime();
  const duration = durationMs > 0 ? durationHours(new Date(departureTime), new Date(arrivalTime)) : 0;
  const aircraftCostCents =
    duration > 0 && aircraftRateCents != null ? Math.round(duration * aircraftRateCents) : 0;

  const selectedInstructor = instructors.find((i) => i.id === instructorId);
  const selectedProgram = programs.find((p) => p.id === trainingProgramId);
  const programRateCents = selectedProgram?.instructionRateCents ?? null;
  const instructorRateCents = selectedInstructor?.instructorProfile?.hourlyRateCents ?? null;
  const instructionRateCents = programRateCents ?? instructorRateCents;
  // Un Solo/Location avec instructeur simplement rattaché (supervision) ne
  // facture pas d'instruction — même règle qu'au compte-rendu normal.
  const isInstructionFlight = type === "INSTRUCTION" && !!instructorId;
  const instructionCostCents =
    isInstructionFlight && instructionRateCents && duration > 0
      ? Math.round(duration * instructionRateCents)
      : 0;
  const totalCostCents = aircraftCostCents + instructionCostCents;
  const showsInstructor = type === "INSTRUCTION" || type === "SOLO";

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
      await apiFetch("/api/flights", {
        method: "POST",
        body: JSON.stringify({
          aircraftId,
          studentId: studentId || null,
          instructorId: showsInstructor ? instructorId || null : null,
          type,
          trainingProgramId: type === "INSTRUCTION" ? trainingProgramId || null : null,
          departureTime: new Date(departureTime).toISOString(),
          arrivalTime: new Date(arrivalTime).toISOString(),
          departureAirfield: departureAirfield.trim().toUpperCase(),
          arrivalAirfield: arrivalAirfield.trim().toUpperCase(),
          remarks: remarks || null,
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
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">Ajouter un vol antérieur</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {loadingRefs ? (
          <p className="p-5 text-sm text-navy-600">Chargement...</p>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
            <p className="text-xs text-navy-600 -mt-1">
              Pour un vol déjà effectué (rattrapage) : ne crée aucun créneau sur le planning et
              n&apos;envoie aucun email — tout est renseigné ici comme pour un retour de vol normal.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Avion">
                <select
                  required
                  value={aircraftId}
                  onChange={(e) => setAircraftId(e.target.value)}
                  className="input"
                >
                  {aircraftList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.registration}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type de vol">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ReservationType)}
                  className="input"
                >
                  {FLIGHT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Pilote (compte débité)">
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input">
                <option value="">— aucun (ex. vol maintenance) —</option>
                <optgroup label="Élèves">
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </optgroup>
                {/* Un FI peut lui-même être le pilote débité (deux FI qui
                    volent ensemble) — voir POST /api/flights. */}
                <optgroup label="Instructeurs">
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.firstName} {i.lastName}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>

            {showsInstructor && (
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
            <p className="text-xs text-navy-500 -mt-1.5">Durée : {formatHoursMinutes(duration)}</p>

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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-navy-600">
                  Terrains posés (optionnel — tours de piste/touchés en route)
                </span>
                <button
                  type="button"
                  onClick={addStop}
                  className="flex items-center gap-1 text-xs text-sunset-600 hover:underline"
                >
                  <Plus size={12} /> Ajouter un terrain
                </button>
              </div>
              {stops.length === 0 && (
                <p className="text-xs text-navy-500">
                  Laisse vide pour un vol simple — seul l&apos;atterrissage à destination sera compté.
                </p>
              )}
              {stops.length > 0 && (
                <div className="grid grid-cols-[1fr_88px_auto] gap-2 mb-1 px-0.5">
                  <span className="text-[11px] text-navy-500">Code OACI</span>
                  <span className="text-[11px] text-navy-500">Touchés</span>
                  <span />
                </div>
              )}
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
                    <button type="button" onClick={() => removeStop(i)} className="text-navy-600 hover:text-red-600">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Field label="Remarques (optionnel)">
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input min-h-16" />
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
                    Avion — {formatHoursMinutes(duration)} × {aircraftRateCents != null ? formatMoney(aircraftRateCents) : "—"}/h
                  </span>
                  <span>{formatMoney(aircraftCostCents)}</span>
                </div>
                {isInstructionFlight && (
                  <div className="flex justify-between text-navy-700">
                    <span>
                      Instruction
                      {instructionRateCents
                        ? ` (${programRateCents ? selectedProgram!.title : "tarif instructeur"}) — ${formatHoursMinutes(duration)} × ${formatMoney(instructionRateCents)}/h`
                        : " (aucun tarif renseigné — ni formation, ni instructeur)"}
                    </span>
                    <span>{formatMoney(instructionCostCents)}</span>
                  </div>
                )}
                {studentId ? (
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

            <button
              type="submit"
              disabled={saving || duration <= 0 || !aircraftId}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-900 text-white font-semibold px-4 py-2 text-sm transition-colors disabled:opacity-60"
            >
              <PlaneLanding size={16} />
              {saving ? "Enregistrement..." : studentId ? "Enregistrer et débiter le compte" : "Enregistrer le vol"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
