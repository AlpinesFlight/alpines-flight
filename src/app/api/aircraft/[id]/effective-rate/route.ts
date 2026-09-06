import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageFinance } from "@/lib/permissions";
import { effectiveAircraftRateCents } from "@/lib/reservations";

type Params = { params: Promise<{ id: string }> };

// Variante de /api/reservations/[id]/effective-rate pour la saisie directe
// d'un vol antérieur (voir POST /api/flights, hors Reservation) : même
// calcul (dérogation pilote éventuelle, voir PilotAircraftRate), mais à
// partir d'un avion + pilote choisis en direct dans le formulaire plutôt que
// d'une réservation existante. Réservé au Gérant, comme le formulaire qui
// l'utilise et comme la dérogation elle-même.
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const aircraft = await prisma.aircraft.findUnique({
    where: { id },
    select: { hourlyRateCents: true },
  });
  if (!aircraft) return NextResponse.json({ error: "not found" }, { status: 404 });

  const studentId = new URL(req.url).searchParams.get("studentId");
  const rateCents = await effectiveAircraftRateCents(studentId, id, aircraft.hourlyRateCents);
  return NextResponse.json({ rateCents });
}
