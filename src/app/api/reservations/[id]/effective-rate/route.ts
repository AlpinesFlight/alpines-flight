import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInstructorOrAbove } from "@/lib/permissions";
import { effectiveAircraftRateCents } from "@/lib/reservations";

type Params = { params: Promise<{ id: string }> };

// Tarif avion horaire qui s'appliquera réellement à la clôture de CE vol
// (dérogation pilote éventuelle incluse, voir PilotAircraftRate) — utilisé
// uniquement pour afficher un montant estimé correct pendant la saisie du
// compte-rendu (CompleteFlightPanel), sans exposer le mécanisme de
// dérogation lui-même (son existence, sa valeur pour d'autres avions, qui
// l'a fixée...) : juste le nombre dont ce vol-ci a besoin. Mêmes droits que
// la clôture elle-même (/complete) — le pilote concerné voit déjà ce
// montant de toute façon dans son propre compte pilote une fois le vol
// clôturé, ce n'est pas une nouvelle divulgation.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: { studentId: true, aircraftId: true, aircraft: { select: { hourlyRateCents: true } } },
  });
  if (!reservation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isOwner = reservation.studentId === session.user.id;
  const isStaff = isInstructorOrAbove(session.user.role);
  if (!isOwner && !isStaff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateCents = await effectiveAircraftRateCents(
    reservation.studentId,
    reservation.aircraftId,
    reservation.aircraft.hourlyRateCents
  );
  return NextResponse.json({ rateCents });
}
