import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageFinance, isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  aircraftId: z.string().optional(),
  studentId: z.string().nullable().optional(),
  instructorId: z.string().nullable().optional(),
  trainingProgramId: z.string().nullable().optional(),
  type: z.enum(["INSTRUCTION", "SOLO", "LOCATION", "MAINTENANCE", "DISCOVERY"]).optional(),
  status: z.enum(["CONFIRMED", "IN_FLIGHT", "CANCELLED", "COMPLETED"]).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
  clientPhone: z.string().nullable().optional(),
  clientEmail: z.string().nullable().optional(),
  priceCents: z.number().int().nonnegative().nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  // Un vol clôturé est verrouillé : seul le Gérant peut encore le modifier
  // (correction financière exceptionnelle), pour préserver l'intégrité du
  // carnet une fois le vol débité et le compte-rendu établi.
  const existing = await prisma.reservation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status === "COMPLETED" && !canManageFinance(session.user.role)) {
    return NextResponse.json(
      { error: "Ce vol est clôturé et verrouillé. Seul le Gérant peut le modifier." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Vol découverte/baptême : gestion interne réservée au staff pédagogique
  // (voir POST ci-dessus pour le détail).
  if (
    (parsed.data.type === "DISCOVERY" || (parsed.data.type === undefined && existing.type === "DISCOVERY")) &&
    !isInstructorOrAbove(session.user.role)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { startTime, endTime, ...rest } = parsed.data;

  const reservation = await prisma.reservation.update({
    where: { id },
    data: {
      ...rest,
      ...(startTime ? { startTime: new Date(startTime) } : {}),
      ...(endTime ? { endTime: new Date(endTime) } : {}),
    },
    include: {
      aircraft: true,
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
      trainingProgram: { select: { id: true, code: true, title: true, instructionRateCents: true } },
    },
  });
  return NextResponse.json(reservation);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.reservation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status === "COMPLETED" && !canManageFinance(session.user.role)) {
    return NextResponse.json(
      { error: "Ce vol est clôturé et verrouillé. Seul le Gérant peut l'annuler." },
      { status: 403 }
    );
  }

  await prisma.reservation.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  return NextResponse.json({ ok: true });
}
