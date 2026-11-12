import { prisma } from "@/lib/prisma";

// Règles pures (sans base de données) — définies dans reservation-rules.ts
// pour être partagées avec le formulaire de réservation côté navigateur,
// réexportées ici pour les routes API.
export {
  OCCUPYING_RESERVATION_TYPES,
  FLYING_RESERVATION_TYPES,
  isOccupyingType,
  nightViolationMessage,
} from "@/lib/reservation-rules";

// Formation suivie actuellement par ce pilote (inscription "en cours" la
// plus récente) — sert à fixer d'office le tarif d'instruction d'un vol
// d'instruction, plutôt que de le redemander à chaque réservation (la
// question figurait déjà au compte-rendu de vol, où elle reste modifiable).
// null = aucune formation en cours : le tarif par défaut de l'instructeur
// s'appliquera à la clôture, comme avant.
export async function currentTrainingProgramId(studentId: string): Promise<string | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: { programId: true },
  });
  return enrollment?.programId ?? null;
}

// Tarif horaire avion effectif pour un pilote/élève sur un avion donné : sa
// dérogation (voir PilotAircraftRate, réglable par le Gérant uniquement
// depuis le compte pilote) si elle existe pour cet avion précis, sinon le
// tarif standard de l'avion. Source unique utilisée à la fois pour le
// calcul réel à la clôture du vol (/api/reservations/[id]/complete) et pour
// l'estimation affichée pendant la saisie (/api/reservations/[id]/
// effective-rate) — sans ça, les deux pouvaient diverger silencieusement.
// Toujours relue en base, jamais mise en cache côté client.
export async function effectiveAircraftRateCents(
  studentId: string | null,
  aircraftId: string,
  standardRateCents: number
): Promise<number> {
  if (!studentId) return standardRateCents;
  const custom = await prisma.pilotAircraftRate.findUnique({
    where: { studentId_aircraftId: { studentId, aircraftId } },
    select: { customRateCents: true },
  });
  return custom?.customRateCents ?? standardRateCents;
}
