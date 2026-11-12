import Link from "next/link";
import { nightWindowsOverlapping } from "@/lib/sun-times";
import { formatTime } from "@/lib/format";
import { parisDayStart, parisToday } from "@/lib/paris-time";

// Mini planning du jour du tableau de bord : une colonne par avion, les
// heures du jour aéronautique de haut en bas, les réservations en blocs de
// la couleur de l'avion (comme la vue Jour du Planning), la nuit hachurée et
// l'heure actuelle en trait orange. Rendu côté serveur, sans JavaScript.
//
// Remplit exactement la hauteur que la carte reçoit (sur ordinateur : celle
// de la carte Météo voisine, même ligne de la grille) sans jamais la pousser
// — contenu en position absolue (demande du Gérant : garder la taille du
// bloc). Sur téléphone, hauteur fixe raisonnable.
//
// Toutes les heures sont lues à Paris : le serveur Vercel tourne en UTC.

interface PlanningAircraft {
  id: string;
  registration: string;
  color: string;
}

interface PlanningReservation {
  id: string;
  type: string;
  status: string;
  startTime: Date;
  endTime: Date;
  aircraftId: string;
  aircraft: { registration: string; color: string };
  student: { firstName: string; lastName: string } | null;
  instructor: { firstName: string; lastName: string } | null;
  clientName: string | null;
}

const TYPE_SHORT: Record<string, string> = {
  INSTRUCTION: "Instruction",
  SOLO: "Solo",
  LOCATION: "Location",
  MAINTENANCE: "Maintenance",
  DISCOVERY: "Vol découverte",
};

const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, #0c2448 7%, transparent) 0 5px, transparent 5px 10px)";

// Minutes écoulées depuis minuit (heure de Paris) pour un instant de la
// journée affichée, bornées à cette journée.
function parisMinutes(at: Date, dayStart: Date): number {
  const ms = Math.min(Math.max(at.getTime() - dayStart.getTime(), 0), 24 * 3_600_000);
  return ms / 60_000;
}

function personLabel(r: PlanningReservation): string {
  if (r.student) return `${r.student.firstName} ${r.student.lastName}`;
  if (r.clientName) return r.clientName;
  if (r.type === "MAINTENANCE") return "Maintenance";
  return "Pilote à définir";
}

export function TodayPlanning({
  aircraft,
  reservations,
  now,
}: {
  aircraft: PlanningAircraft[];
  reservations: PlanningReservation[];
  now: Date;
}) {
  const dayStart = parisDayStart(parisToday());
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

  // Jour aéronautique (fin de la nuit du matin → début de celle du soir).
  const windows = nightWindowsOverlapping(dayStart, new Date(dayEnd.getTime() - 1));
  const morning = windows.find((w) => w.start < dayStart && w.end > dayStart);
  const evening = windows.find((w) => w.start >= dayStart && w.start < dayEnd);
  const aeroStart = morning ? parisMinutes(morning.end, dayStart) : 7 * 60;
  const aeroEnd = evening ? parisMinutes(evening.start, dayStart) : 19 * 60;

  // Plage affichée : heures pleines autour du jour aéronautique, élargie si
  // une réservation déborde.
  let lo = aeroStart;
  let hi = aeroEnd;
  for (const r of reservations) {
    lo = Math.min(lo, parisMinutes(r.startTime, dayStart));
    hi = Math.max(hi, parisMinutes(r.endTime, dayStart));
  }
  lo = Math.max(0, Math.floor(lo / 60) * 60);
  hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
  const span = Math.max(hi - lo, 60);
  const pct = (minutes: number) => `${((minutes - lo) / span) * 100}%`;
  const step = span > 12 * 60 ? 120 : 60;
  const hours: number[] = [];
  for (let m = lo; m <= hi; m += step) hours.push(m);

  const nowMin = parisMinutes(now, dayStart);
  const showNow = now >= dayStart && now < dayEnd && nowMin >= lo && nowMin <= hi;

  return (
    <div className="af-planning relative h-[300px] lg:h-auto lg:flex-1 lg:min-h-0">
      <div className="absolute inset-0 flex flex-col px-4 pt-2.5 pb-3">
        {/* Avions */}
        <div className="flex pl-9 pb-1.5">
          {aircraft.map((a) => (
            <div key={a.id} className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-xs font-semibold text-navy-800">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
              <span className="truncate">{a.registration}</span>
            </div>
          ))}
        </div>

        <div className="relative flex-1 min-h-0 flex">
          {/* Heures */}
          <div className="relative w-9 shrink-0">
            {hours.map((m, i) => (
              <span
                key={m}
                className="absolute right-1.5 text-[10px] tabular-nums text-navy-400"
                style={{ top: pct(m), transform: i === 0 ? "none" : i === hours.length - 1 ? "translateY(-100%)" : "translateY(-50%)" }}
              >
                {Math.floor(m / 60)}h
              </span>
            ))}
          </div>

          {/* Grille */}
          <div className="relative flex-1 min-w-0 rounded-lg border border-navy-100 overflow-hidden">
            {aeroStart > lo && (
              <div className="absolute inset-x-0 top-0" style={{ height: pct(aeroStart), backgroundImage: HATCH }} />
            )}
            {aeroEnd < hi && (
              <div
                className="absolute inset-x-0 bottom-0"
                style={{ top: pct(aeroEnd), backgroundImage: HATCH }}
              />
            )}
            {hours.slice(1, -1).map((m) => (
              <div key={m} className="absolute inset-x-0 border-t border-navy-50" style={{ top: pct(m) }} />
            ))}

            <div className="absolute inset-0 flex">
              {aircraft.map((a, i) => (
                <div key={a.id} className={`relative flex-1 min-w-0 ${i > 0 ? "border-l border-navy-50" : ""}`}>
                  {reservations
                    .filter((r) => r.aircraftId === a.id)
                    .map((r) => {
                      const start = parisMinutes(r.startTime, dayStart);
                      const end = parisMinutes(r.endTime, dayStart);
                      const inFlight = r.status === "IN_FLIGHT";
                      const done = r.status === "COMPLETED";
                      const maintenance = r.type === "MAINTENANCE";
                      const accent = inFlight ? "#f04818" : done ? "#95a7bd" : a.color;
                      const time = `${formatTime(r.startTime)}–${formatTime(r.endTime)}`;
                      return (
                        <Link
                          key={r.id}
                          href="/planning"
                          title={[r.aircraft.registration, personLabel(r), time, TYPE_SHORT[r.type] ?? r.type, r.instructor ? `avec ${r.instructor.firstName} ${r.instructor.lastName}` : ""]
                            .filter(Boolean)
                            .join(" · ")}
                          className="absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-0.5 leading-tight hover:brightness-95 transition"
                          style={{
                            top: pct(start),
                            height: `max(${((Math.max(end - start, 15)) / span) * 100}%, 16px)`,
                            borderLeft: `3px solid ${accent}`,
                            background: maintenance
                              ? "repeating-linear-gradient(135deg, #f2f5f9 0 6px, #ffffff 6px 12px)"
                              : done
                              ? "#f2f5f9"
                              : `color-mix(in srgb, ${accent} 15%, white)`,
                            color: done ? "#5f7896" : "#0a1e39",
                          }}
                        >
                          <span className="flex items-center gap-1 text-[11px] font-semibold">
                            {inFlight && <span className="af-live-dot" aria-label="En vol" />}
                            <span className="truncate">{personLabel(r)}</span>
                          </span>
                          <span className="block truncate text-[10px] opacity-75">
                            {time} · {TYPE_SHORT[r.type] ?? r.type}
                          </span>
                        </Link>
                      );
                    })}
                </div>
              ))}
            </div>

            {showNow && (
              <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: pct(nowMin) }}>
                <div className="relative border-t-2 border-sunset-500">
                  <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-sunset-500" />
                </div>
              </div>
            )}

            {reservations.length === 0 && (
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs text-navy-500 shadow-sm">
                  Aucune réservation aujourd&apos;hui
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
