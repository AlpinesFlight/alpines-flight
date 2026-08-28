import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  departureTime: z.string().optional(), // ISO ; par défaut l'instant présent
});

// Le pilote (ou l'admin/instructeur) valide le départ réel du vol : passe la
// réservation en IN_FLIGHT et horodate le départ. Rend l'avion visiblement
// "en vol" pour tout le monde sur le planning.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isOwner = reservation.studentId === session.user.id;
  const isStaff = isInstructorOrAbove(session.user.role);
  if (!isStaff && !isOwner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (reservation.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "Cette réservation n'est pas en attente de départ." },
      { status: 409 }
    );
  }

  const updated = await prisma.reservation.update({
    where: { id },
    data: {
      status: "IN_FLIGHT",
      actualDepartureTime: parsed.data.departureTime
        ? new Date(parsed.data.departureTime)
        : new Date(),
    },
    include: {
      aircraft: { select: safeAircraftSelect },
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
    },
  });

  return NextResponse.json(updated);
}
