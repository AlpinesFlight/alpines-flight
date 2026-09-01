"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { FlightLog } from "@/types/models";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { Pencil, Trash2, X } from "lucide-react";

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
        `Supprimer ce vol (${f.aircraft.registration}, ${formatDate(f.date)}, ${f.duration}h) ? Le solde du pilote, les heures de l'avion et la réservation d'origine seront réajustés en conséquence.`
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
                    <span className="font-medium text-navy-900">{a.registration}</span>
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
                <td className="px-5 py-3 font-medium text-navy-900">{f.aircraft.registration}</td>
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
                <td className="px-5 py-3 text-right text-navy-700 whitespace-nowrap">{formatHours(f.duration)}</td>
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
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

function EditFlightModal({
  flight,
  onClose,
  onSaved,
}: {
  flight: FlightLog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [departureTime, setDepartureTime] = useState(toLocalInput(new Date(flight.departureTime)));
  const [arrivalTime, setArrivalTime] = useState(toLocalInput(new Date(flight.arrivalTime)));
  const [departureAirfield, setDepartureAirfield] = useState(flight.departureAirfield ?? "");
  const [arrivalAirfield, setArrivalAirfield] = useState(flight.arrivalAirfield ?? "");
  const [totalLandings, setTotalLandings] = useState(String(flight.totalLandings));
  const [remarks, setRemarks] = useState(flight.remarks ?? "");
  const [aircraftCost, setAircraftCost] = useState(String(flight.aircraftCostCents / 100));
  const [instructionCost, setInstructionCost] = useState(String(flight.instructionCostCents / 100));
  const [fuelRefillDone, setFuelRefillDone] = useState(flight.fuelRefillDone);
  const [fuelCard, setFuelCard] = useState(flight.fuelCard ?? "BP");
  const [fuelLiters, setFuelLiters] = useState(flight.fuelLiters ? String(flight.fuelLiters) : "");
  const [fuelType, setFuelType] = useState(flight.fuelType ?? "AVGAS_100LL");
  const [fuelAirfield, setFuelAirfield] = useState(flight.fuelAirfield ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const durationMs = new Date(arrivalTime).getTime() - new Date(departureTime).getTime();
  const duration = durationMs > 0 ? Math.round((durationMs / 3_600_000) * 10) / 10 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/flights/${flight.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          departureTime: new Date(departureTime).toISOString(),
          arrivalTime: new Date(arrivalTime).toISOString(),
          departureAirfield: departureAirfield.trim().toUpperCase() || null,
          arrivalAirfield: arrivalAirfield.trim().toUpperCase() || null,
          totalLandings: parseInt(totalLandings, 10) || 0,
          remarks: remarks || null,
          aircraftCostCents: Math.round(parseFloat(aircraftCost) * 100) || 0,
          instructionCostCents: Math.round(parseFloat(instructionCost) * 100) || 0,
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
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">
            Modifier le vol — {flight.aircraft.registration}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <p className="text-xs text-navy-600 -mt-1">
            {flight.student ? `${flight.student.firstName} ${flight.student.lastName}` : "Vol sans élève"}
            {flight.instructor ? ` avec ${flight.instructor.firstName} ${flight.instructor.lastName}` : ""}
            {" — "}pour changer l&apos;avion, l&apos;élève ou l&apos;instructeur, supprime ce vol et
            ressaisis-le depuis le planning.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Départ</span>
              <input
                type="datetime-local"
                required
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Arrivée</span>
              <input
                type="datetime-local"
                required
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="input"
              />
            </label>
          </div>
          <p className="text-xs text-navy-500 -mt-1.5">Durée recalculée : {formatHours(duration)}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Terrain de départ (OACI)</span>
              <input
                placeholder="ex : LFNA"
                value={departureAirfield}
                onChange={(e) => setDepartureAirfield(e.target.value.toUpperCase())}
                maxLength={12}
                className="input uppercase tracking-wide"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Terrain de destination (OACI)</span>
              <input
                placeholder="ex : LFNA"
                value={arrivalAirfield}
                onChange={(e) => setArrivalAirfield(e.target.value.toUpperCase())}
                maxLength={12}
                className="input uppercase tracking-wide"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Atterrissages (cycles)</span>
            <input
              type="number"
              min={0}
              value={totalLandings}
              onChange={(e) => setTotalLandings(e.target.value)}
              className="input"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Coût avion (€)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={aircraftCost}
                onChange={(e) => setAircraftCost(e.target.value)}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Coût instruction (€)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={instructionCost}
                onChange={(e) => setInstructionCost(e.target.value)}
                className="input"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Remarques</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="input min-h-16"
            />
          </label>

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

          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={saving || duration <= 0}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}
