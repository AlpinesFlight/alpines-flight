import type { Aircraft, Reservation, ReservationType, UserLite } from "@/types/models";
import { nightWindowsOverlapping } from "@/lib/sun-times";
import { isOccupyingType } from "@/lib/reservation-rules";

// Utilitaires du formulaire de réservation et du planning (navigateur). Les
// heures sont celles du navigateur, comme tout le planning
// (react-big-calendar travaille en heure locale) — l'école et ses pilotes
// sont en France.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// "2026-11-12" + "10:30" → date locale ; null si l'un des deux champs est
// vide ou incomplet (saisie en cours).
export function combineDateTime(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})/.exec(time);
  if (!d || !t) return null;
  const result = new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function ceilToHalfHour(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const m = r.getMinutes();
  if (m !== 0 && m !== 30) r.setMinutes(m < 30 ? 30 : 60);
  return r;
}

export function formatClock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDurationMs(ms: number): string {
  const total = Math.round(ms / MINUTE);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h${pad2(m)}` : `${h}h`;
}

// "jeudi 12 novembre · 10:00 – 11:00" (ou, sur plusieurs jours,
// "jeudi 12 novembre 10:00 → sam. 14 nov. 17:00").
export function formatSlot(start: Date, end: Date): string {
  const day = start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  if (toDateInput(start) === toDateInput(end)) return `${day} · ${formatClock(start)} – ${formatClock(end)}`;
  const endDay = end.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return `${day} ${formatClock(start)} → ${endDay} ${formatClock(end)}`;
}

export function personName(u?: { firstName: string; lastName: string } | null): string {
  return u ? `${u.firstName} ${u.lastName}` : "";
}

// Jour aéronautique d'une date (fin de la nuit du matin → début de celle du
// soir, voir sun-times.ts) — affiché sous le choix de l'horaire et utilisé
// pour cadrer le planning. null si le calcul échoue (sun-times échoue
// "ouvert", ne doit jamais bloquer une réservation).
export function aeronauticalDay(day: Date): { start: Date; end: Date } | null {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  const windows = nightWindowsOverlapping(dayStart, dayEnd);
  const morning = windows.find((w) => w.start < dayStart && w.end > dayStart && w.end <= dayEnd);
  const evening = windows.find((w) => w.start >= dayStart && w.start <= dayEnd);
  if (!morning || !evening) return null;
  return { start: morning.end, end: evening.start };
}

// Créneau proposé par "+ Réserver" : la prochaine demi-heure, pour 1h —
// repoussé au matin suivant s'il tombe (même en partie) dans la nuit
// aéronautique, plutôt que d'ouvrir le formulaire sur un créneau refusé.
export function defaultSlot(now = new Date(), durationMs = HOUR): { start: Date; end: Date } {
  let start = ceilToHalfHour(now);
  for (let i = 0; i < 3; i++) {
    const end = new Date(start.getTime() + durationMs);
    const night = nightWindowsOverlapping(start, end)[0];
    if (!night) return { start, end };
    start = ceilToHalfHour(night.end);
  }
  return { start, end: new Date(start.getTime() + durationMs) };
}

// Élève en formation (pas encore breveté, StudentProfile.isPilot à false).
// Un pilote breveté ou un instructeur (absent de la liste des élèves) n'en
// est pas un.
export function isTraineePilot(pilotId: string, students: UserLite[]): boolean {
  if (!pilotId) return false;
  const s = students.find((x) => x.id === pilotId);
  return !!s && s.studentProfile?.isPilot !== true;
}

export type BookingKind = "FLIGHT" | "MAINTENANCE";

// Le type de vol ne se demande plus : il se déduit de qui vole.
//   instructeur à bord                    → Instruction
//   élève + instructeur qui supervise     → Solo supervisé
//   élève sans instructeur                → Solo supervisé (sans FI désigné)
//   pilote breveté ou FI, seul            → Location
export function deriveReservationType(p: {
  kind: BookingKind;
  pilotIsTrainee: boolean;
  instructorId: string;
  soloSupervised: boolean;
}): ReservationType {
  if (p.kind === "MAINTENANCE") return "MAINTENANCE";
  if (p.instructorId) return p.pilotIsTrainee && p.soloSupervised ? "SOLO" : "INSTRUCTION";
  return p.pilotIsTrainee ? "SOLO" : "LOCATION";
}

export const TYPE_LABELS: Record<ReservationType, string> = {
  INSTRUCTION: "Vol d'instruction",
  SOLO: "Solo supervisé",
  LOCATION: "Location",
  MAINTENANCE: "Maintenance",
  DISCOVERY: "Vol découverte",
};

function overlaps(r: Reservation, start: Date, end: Date): boolean {
  return new Date(r.startTime) < end && new Date(r.endTime) > start;
}

// Mêmes règles que POST/PATCH /api/reservations (qui restent juges en
// dernier ressort) : un avion ne peut pas être sur deux réservations à la
// fois ; un instructeur ne peut pas être à bord de deux vols à la fois
// (un solo qu'il supervise ne l'occupe pas, voir OCCUPYING_RESERVATION_TYPES).
export function findAircraftConflict(
  reservations: Reservation[],
  aircraftId: string,
  start: Date,
  end: Date,
  excludeId?: string
): Reservation | null {
  return (
    reservations.find(
      (r) => r.id !== excludeId && r.status !== "CANCELLED" && r.aircraftId === aircraftId && overlaps(r, start, end)
    ) ?? null
  );
}

export function findInstructorConflict(
  reservations: Reservation[],
  instructorId: string,
  type: ReservationType,
  start: Date,
  end: Date,
  excludeId?: string
): Reservation | null {
  if (!instructorId || !isOccupyingType(type)) return null;
  return (
    reservations.find(
      (r) =>
        r.id !== excludeId &&
        r.status !== "CANCELLED" &&
        r.instructorId === instructorId &&
        isOccupyingType(r.type) &&
        overlaps(r, start, end)
    ) ?? null
  );
}

// Avions proposés à la réservation : toute la flotte sauf les avions
// retirés — en gardant celui de la réservation modifiée, même retiré depuis.
export function bookableAircraft(aircraftList: Aircraft[], keepId?: string): Aircraft[] {
  return aircraftList.filter((a) => a.status !== "RETIRED" || a.id === keepId);
}

// Avion pré-sélectionné : le premier en état de vol et libre sur le
// créneau, sinon le premier en état de vol, sinon le premier proposé.
export function pickDefaultAircraft(
  aircraft: Aircraft[],
  reservations: Reservation[],
  start: Date,
  end: Date
): string {
  const available = aircraft.filter((a) => a.status === "AVAILABLE");
  const free = available.find((a) => !findAircraftConflict(reservations, a.id, start, end));
  return (free ?? available[0] ?? aircraft[0])?.id ?? "";
}
