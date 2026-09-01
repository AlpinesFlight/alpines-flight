import { nightWindowsOverlapping } from "@/lib/sun-times";

// Types de vol qui exigent la présence physique de l'instructeur à bord —
// utilisé pour le conflit d'agenda instructeur (POST et PATCH réservations).
// SOLO en est volontairement exclu : l'élève vole seul, l'instructeur qui le
// supervise reste disponible ailleurs (y compris sur un vol d'instruction)
// en même temps.
export const OCCUPYING_RESERVATION_TYPES = ["INSTRUCTION", "DISCOVERY"] as const;

// Types qui font effectivement voler l'avion — MAINTENANCE en est exclu
// (l'avion est au sol, la règle de nuit aéronautique ne le concerne pas).
export const FLYING_RESERVATION_TYPES = ["INSTRUCTION", "SOLO", "LOCATION", "DISCOVERY"] as const;

function formatNightBound(d: Date) {
  const day = d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

// Règle "nuit aéronautique" (voir src/lib/sun-times.ts pour la définition
// réglementaire) : un vol ne peut ni décoller ni atterrir pendant la nuit
// aéronautique. Une réservation qui s'étend sur plusieurs jours peut tout à
// fait englober une nuit entière (l'avion est alors simplement ailleurs,
// pas en vol) — seul un chevauchement PARTIEL (début ou fin tombant dans
// la nuit) est refusé. Retourne un message d'erreur si la réservation doit
// être refusée, sinon null. Utilisé par POST et PATCH /api/reservations.
export function nightViolationMessage(type: string, start: Date, end: Date): string | null {
  if (!FLYING_RESERVATION_TYPES.includes(type as (typeof FLYING_RESERVATION_TYPES)[number])) return null;

  for (const w of nightWindowsOverlapping(start, end)) {
    const fullyContained = start <= w.start && end >= w.end;
    if (!fullyContained) {
      return (
        `Ce créneau chevauche la nuit aéronautique (${formatNightBound(w.start)} → ${formatNightBound(w.end)}) : ` +
        "l'avion ne peut pas être réservé pour voler pendant cette période. Pour un vol qui reste sur place " +
        "plusieurs jours, prolonge la réservation pour englober la nuit entière."
      );
    }
  }
  return null;
}
