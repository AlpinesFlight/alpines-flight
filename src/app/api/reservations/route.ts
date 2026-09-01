import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { safeUserSelect, safeAircraftSelect, safeReservationStudentSelect } from "@/lib/selects";
import { isInstructorOrAbove } from "@/lib/permissions";
import { OCCUPYING_RESERVATION_TYPES, nightViolationMessage } from "@/lib/reservations";
import { notifyReservation } from "@/lib/reservation-emails";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  // ?type=DISCOVERY — utilisé par la page Vol découverte pour ne charger que
  // ces réservations-là plutôt que tout le planning de l'école.
  const typeParam = z
    .enum(["INSTRUCTION", "SOLO", "LOCATION", "MAINTENANCE", "DISCOVERY"])
    .optional()
    .safeParse(searchParams.get("type") ?? undefined);
  const type = typeParam.success ? typeParam.data : undefined;

  const reservations = await prisma.reservation.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(type ? { type } : {}),
      ...(from && to
        ? { startTime: { gte: new Date(from) }, endTime: { lte: new Date(to) } }
        : {}),
    },
    include: {
      aircraft: { select: safeAircraftSelect },
      student: { select: safeReservationStudentSelect },
      instructor: { select: safeUserSelect },
      trainingProgram: { select: { id: true, code: true, title: true, instructionRateCents: true } },
    },
    orderBy: { startTime: "asc" },
  });
  return NextResponse.json(reservations);
}

const createSchema = z
  .object({
    aircraftId: z.string(),
    studentId: z.string().optional().nullable(),
    instructorId: z.string().optional().nullable(),
    trainingProgramId: z.string().optional().nullable(),
    type: z.enum(["INSTRUCTION", "SOLO", "LOCATION", "MAINTENANCE", "DISCOVERY"]),
    startTime: z.string(),
    endTime: z.string(),
    notes: z.string().optional().nullable(),
    // Vol découverte/baptême uniquement — voir Reservation.clientName et
    // /api/reservations/[id]/complete.
    clientName: z.string().optional().nullable(),
    clientPhone: z.string().optional().nullable(),
    clientEmail: z.string().optional().nullable(),
    priceCents: z.number().int().nonnegative().optional().nullable(),
    // Choisi ici, à la réservation — pas à la clôture (voir complete/
    // route.ts) — revérifié plus bas contre StudentProfile.canGiveBaptism,
    // jamais fait confiance au seul booléen envoyé par le client.
    isBaptism: z.boolean().optional().default(false),
  })
  .refine((d) => d.type !== "DISCOVERY" || !!d.clientName?.trim(), {
    message: "Le nom du client est requis pour un vol découverte.",
    path: ["clientName"],
  });

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  // Vol découverte/baptême : gestion interne, réservée au staff pédagogique
  // (FI et au-dessus) — un client de passage n'a pas de compte pour se le
  // réserver lui-même (voir Q3 : "gestion interne").
  if (parsed.data.type === "DISCOVERY" && !isInstructorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { aircraftId, instructorId, studentId, startTime, endTime, isBaptism: requestedBaptism } = parsed.data;
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (end <= start) {
    return NextResponse.json(
      { error: "L'heure de fin doit être après l'heure de début." },
      { status: 400 }
    );
  }

  const nightError = nightViolationMessage(parsed.data.type, start, end);
  if (nightError) return NextResponse.json({ error: nightError }, { status: 400 });

  // Vérification des conflits (même avion, ou même instructeur, sur un créneau chevauchant)
  const overlapWhere = {
    status: { not: "CANCELLED" as const },
    startTime: { lt: end },
    endTime: { gt: start },
  };

  const aircraftConflict = await prisma.reservation.findFirst({
    where: { ...overlapWhere, aircraftId },
  });
  if (aircraftConflict) {
    return NextResponse.json(
      { error: "Cet avion est déjà réservé sur ce créneau." },
      { status: 409 }
    );
  }

  // Un instructeur ne peut être QUE sur un vol à la fois s'il doit y être
  // physiquement (instruction, vol découverte) — mais un vol solo n'exige
  // pas sa présence à bord : il peut superviser un solo en même temps qu'il
  // vole en instruction (ou plusieurs solos en parallèle). Le conflit ne
  // porte donc que sur les vols "occupants" entre eux.
  if (
    instructorId &&
    OCCUPYING_RESERVATION_TYPES.includes(parsed.data.type as (typeof OCCUPYING_RESERVATION_TYPES)[number])
  ) {
    const instructorConflict = await prisma.reservation.findFirst({
      where: { ...overlapWhere, instructorId, type: { in: [...OCCUPYING_RESERVATION_TYPES] } },
    });
    if (instructorConflict) {
      return NextResponse.json(
        { error: "Cet instructeur est déjà sur un autre vol accompagné sur ce créneau." },
        { status: 409 }
      );
    }
  }

  // Revérifié ici plutôt que de faire confiance au booléen envoyé par le
  // client (même logique qu'à la clôture, voir complete/route.ts).
  let isBaptism = false;
  if (requestedBaptism && studentId) {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { canGiveBaptism: true },
    });
    isBaptism = profile?.canGiveBaptism === true;
  }

  const reservation = await prisma.reservation.create({
    data: {
      ...parsed.data,
      startTime: start,
      endTime: end,
      isBaptism,
    },
    include: {
      aircraft: { select: safeAircraftSelect },
      student: { select: safeReservationStudentSelect },
      instructor: { select: safeUserSelect },
      trainingProgram: { select: { id: true, code: true, title: true, instructionRateCents: true } },
    },
  });

  await notifyReservation(reservation, "created");

  return NextResponse.json(reservation, { status: 201 });
}
