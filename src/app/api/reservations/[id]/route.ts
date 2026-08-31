import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect, safeReservationStudentSelect } from "@/lib/selects";
import { canManageFinance, isInstructorOrAbove } from "@/lib/permissions";
import { OCCUPYING_RESERVATION_TYPES } from "@/lib/reservations";
import { notifyReservation } from "@/lib/reservation-emails";
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
  // Revérifié plus bas contre StudentProfile.canGiveBaptism si true, comme
  // à la création — jamais fait confiance au seul booléen du client.
  isBaptism: z.boolean().optional(),
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
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  // Vol découverte/baptême : gestion interne réservée au staff pédagogique
  // (voir POST ci-dessus pour le détail).
  if (
    (parsed.data.type === "DISCOVERY" || (parsed.data.type === undefined && existing.type === "DISCOVERY")) &&
    !isInstructorOrAbove(session.user.role)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { startTime, endTime, isBaptism: requestedBaptism, ...rest } = parsed.data;

  // Recalcule l'état effectif après patch (champs non fournis = valeur
  // actuelle) pour revérifier les conflits d'agenda, comme à la création —
  // sans ça, modifier l'horaire ou l'avion d'une réservation existante
  // pouvait créer un chevauchement non détecté.
  const effectiveAircraftId = parsed.data.aircraftId ?? existing.aircraftId;
  const effectiveInstructorId =
    parsed.data.instructorId !== undefined ? parsed.data.instructorId : existing.instructorId;
  const effectiveStudentId =
    parsed.data.studentId !== undefined ? parsed.data.studentId : existing.studentId;
  const effectiveType = parsed.data.type ?? existing.type;
  const effectiveStatus = parsed.data.status ?? existing.status;
  const effectiveStart = startTime ? new Date(startTime) : existing.startTime;
  const effectiveEnd = endTime ? new Date(endTime) : existing.endTime;

  // Si le client redemande le baptême (ou change l'élève/pilote), revérifie
  // contre l'autorisation réelle plutôt que de recopier tel quel — un
  // false explicite n'a lui pas besoin d'être revérifié (retirer le
  // baptême est toujours sûr).
  let isBaptismUpdate: { isBaptism?: boolean } = {};
  if (requestedBaptism !== undefined) {
    if (requestedBaptism && effectiveStudentId) {
      const profile = await prisma.studentProfile.findUnique({
        where: { userId: effectiveStudentId },
        select: { canGiveBaptism: true },
      });
      isBaptismUpdate = { isBaptism: profile?.canGiveBaptism === true };
    } else {
      isBaptismUpdate = { isBaptism: false };
    }
  }

  if (effectiveStatus !== "CANCELLED") {
    if (effectiveEnd <= effectiveStart) {
      return NextResponse.json(
        { error: "L'heure de fin doit être après l'heure de début." },
        { status: 400 }
      );
    }

    const overlapWhere = {
      id: { not: id },
      status: { not: "CANCELLED" as const },
      startTime: { lt: effectiveEnd },
      endTime: { gt: effectiveStart },
    };

    const aircraftConflict = await prisma.reservation.findFirst({
      where: { ...overlapWhere, aircraftId: effectiveAircraftId },
    });
    if (aircraftConflict) {
      return NextResponse.json(
        { error: "Cet avion est déjà réservé sur ce créneau." },
        { status: 409 }
      );
    }

    // Même règle qu'à la création : seuls les vols "occupants" (instruction,
    // découverte) se bloquent entre eux — voir OCCUPYING_RESERVATION_TYPES.
    if (
      effectiveInstructorId &&
      OCCUPYING_RESERVATION_TYPES.includes(effectiveType as (typeof OCCUPYING_RESERVATION_TYPES)[number])
    ) {
      const instructorConflict = await prisma.reservation.findFirst({
        where: {
          ...overlapWhere,
          instructorId: effectiveInstructorId,
          type: { in: [...OCCUPYING_RESERVATION_TYPES] },
        },
      });
      if (instructorConflict) {
        return NextResponse.json(
          { error: "Cet instructeur est déjà sur un autre vol accompagné sur ce créneau." },
          { status: 409 }
        );
      }
    }
  }

  const reservation = await prisma.reservation.update({
    where: { id },
    data: {
      ...rest,
      ...(startTime ? { startTime: new Date(startTime) } : {}),
      ...(endTime ? { endTime: new Date(endTime) } : {}),
      ...isBaptismUpdate,
    },
    include: {
      aircraft: { select: safeAircraftSelect },
      student: { select: safeReservationStudentSelect },
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

  const cancelled = await prisma.reservation.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: {
      aircraft: { select: safeAircraftSelect },
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
    },
  });
  await notifyReservation(cancelled, "cancelled");

  return NextResponse.json({ ok: true });
}
