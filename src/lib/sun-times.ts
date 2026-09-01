// Le module n'a pas d'export par défaut (voir @types/suncalc, uniquement
// des exports nommés) — import namespace, pas import par défaut.
import * as SunCalc from "suncalc";

// Aérodrome de base (LFNA, Gap-Tallard) — l'école n'opère que depuis ce
// terrain, une seule position suffit pour tous les calculs de nuit
// aéronautique. Altitude transmise à suncalc (terrain en montagne, 599m)
// pour un lever/coucher légèrement plus précis que l'approximation "niveau
// de la mer".
const LFNA_LAT = 44.4539;
const LFNA_LON = 6.0367;
const LFNA_ELEVATION_M = 599;

// Nuit aéronautique réglementaire française (arrêté Espace du 3 décembre
// 2020, art. 3.3 ; s'applique en métropole, latitudes 30°-60°) : de 30 min
// après le coucher du soleil à 30 min avant son lever. Calcul 100% local
// (aucun appel réseau, voir la contrainte "ne doit pas ralentir le
// chargement de la page") via la bibliothèque suncalc.
const NIGHT_BUFFER_MS = 30 * 60 * 1000;

const parisDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface DayParts {
  year: number;
  month: number; // 1-12
  day: number;
}

// Jour calendaire à Paris pour un instant donné — indépendant du fuseau
// horaire d'exécution (le serveur Vercel tourne en UTC, pas en heure de
// Paris ; sans ceci, tard le soir ou tôt le matin en heure d'été, on
// calculerait la nuit du mauvais jour).
function parisDateParts(instant: Date): DayParts {
  const parts = parisDayFormatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function addDays({ year, month, day }: DayParts, delta: number): DayParts {
  // Construit à midi UTC pour rester bien à l'intérieur du jour calendaire
  // visé quel que soit le décalage France (évite tout débordement UTC).
  const dt = new Date(Date.UTC(year, month - 1, day + delta, 12, 0, 0));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function sunTimesForParisDay({ year, month, day }: DayParts) {
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return SunCalc.getTimes(noonUtc, LFNA_LAT, LFNA_LON, LFNA_ELEVATION_M);
}

const nightWindowCache = new Map<string, { start: Date; end: Date }>();

// Fenêtre de nuit aéronautique qui commence le SOIR du jour calendaire
// (Paris) donné : du coucher + 30min ce soir-là au lever - 30min le
// lendemain matin.
function nightWindowStartingEveningOf(parts: DayParts): { start: Date; end: Date } {
  const key = `${parts.year}-${parts.month}-${parts.day}`;
  const cached = nightWindowCache.get(key);
  if (cached) return cached;

  const today = sunTimesForParisDay(parts);
  const tomorrow = sunTimesForParisDay(addDays(parts, 1));
  // sunrise/sunset sont typés nullable par suncalc (cas polaire, soleil ne
  // se levant/couchant pas ce jour-là) — jamais le cas à la latitude de
  // LFNA (44°N), mais on lève une erreur claire plutôt qu'un crash muet
  // si jamais suncalc changeait de comportement.
  if (!today.sunset || !tomorrow.sunrise) {
    throw new Error("Lever/coucher du soleil indisponible pour ce jour (latitude inattendue ?).");
  }
  const result = {
    start: new Date(today.sunset.getTime() + NIGHT_BUFFER_MS),
    end: new Date(tomorrow.sunrise.getTime() - NIGHT_BUFFER_MS),
  };
  nightWindowCache.set(key, result);
  return result;
}

// La fenêtre de nuit aéronautique en cours à un instant donné, si cet
// instant tombe dedans (sinon null). Teste la nuit ayant pu commencer la
// veille (Paris) et celle du jour même — au plus une des deux contient
// l'instant.
export function currentNightWindow(instant: Date): { start: Date; end: Date } | null {
  const today = parisDateParts(instant);
  const yesterday = addDays(today, -1);
  for (const parts of [yesterday, today]) {
    const { start, end } = nightWindowStartingEveningOf(parts);
    if (instant >= start && instant < end) return { start, end };
  }
  return null;
}

export function isAeronauticalNight(instant: Date): boolean {
  return currentNightWindow(instant) !== null;
}

// Toutes les fenêtres de nuit aéronautique qui chevauchent, même
// partiellement, l'intervalle [start, end) donné — utilisé pour la
// validation de réservation (voir /api/reservations). Parcourt jour par
// jour de la veille du départ au lendemain de l'arrivée, largement
// suffisant même pour un séjour de plusieurs semaines (coût négligeable,
// suncalc est purement local).
export function nightWindowsOverlapping(start: Date, end: Date): Array<{ start: Date; end: Date }> {
  const results: Array<{ start: Date; end: Date }> = [];
  let cursor = addDays(parisDateParts(start), -1);
  const stop = parisDateParts(end);
  // Sécurité anti-boucle infinie si jamais start > end (ne devrait pas
  // arriver, déjà validé en amont par les routes appelantes).
  let guard = 0;
  while (guard++ < 400) {
    const window = nightWindowStartingEveningOf(cursor);
    if (window.start < end && window.end > start) results.push(window);
    if (cursor.year === stop.year && cursor.month === stop.month && cursor.day === stop.day) break;
    cursor = addDays(cursor, 1);
  }
  return results;
}
