import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAvailabilityInstructorSelect } from "@/lib/selects";
import { zodErrorMessage } from "@/lib/api-errors";
import { canSeeInstructorAvailability, isGerant } from "@/lib/permissions";
import { z } from "zod";

// Réservé aux FI (qui les saisissent) et au Gérant (qui les consulte pour
// adapter l'activité de l'école) — voir canSeeInstructorAvailability.
// Vue partagée : tout le monde ayant accès à la page voit les créneaux de
// tous les instructeurs (utile pour se coordonner entre FI), l'édition
// reste elle réservée à chacun sur les siens (voir [id]/route.ts).
export async function GET(req: Request) {
  const session = await auth();
  if (!session || !canSeeInstructorAvailability(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const availability = await prisma.instructorAvailability.findMany({
    where: from && to ? { startTime: { gte: new Date(from) }, endTime: { lte: new Date(to) } } : undefined,
    include: { instructor: { select: safeAvailabilityInstructorSelect } },
    orderBy: { startTime: "asc" },
  });
  return NextResponse.json(availability);
}

const createSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  notes: z.string().optional().nullable(),
  // Optionnel — un FI ne crée que pour lui-même (ignoré s'il le transmet
  // quand même), seul le Gérant peut saisir une dispo pour un autre FI
  // (ex. le FI lui-même ne l'a pas encore fait, ou n'a pas de compte).
  instructorId: z.string().optional().nullable(),
});

// Chacun ne crée que pour lui-même par défaut — sauf le Gérant, qui peut
// choisir n'importe quel instructeur via instructorId (voir aussi le
// Gérant lui-même, qui peut être FI en même temps, ex. Tom GREL FI(A)/FE(A)
// — pas restreint à role === "INSTRUCTOR" strictement pour cette raison).
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canSeeInstructorAvailability(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);
  if (end <= start) {
    return NextResponse.json(
      { error: "L'heure de fin doit être après l'heure de début." },
      { status: 400 }
    );
  }

  let instructorId = session.user.id;
  if (parsed.data.instructorId && parsed.data.instructorId !== session.user.id) {
    if (!isGerant(session.user.role)) {
      return NextResponse.json(
        { error: "Seul le Gérant peut saisir une disponibilité pour un autre instructeur." },
        { status: 401 }
      );
    }
    const target = await prisma.instructorProfile.findUnique({
      where: { userId: parsed.data.instructorId },
    });
    if (!target) return NextResponse.json({ error: "Instructeur introuvable." }, { status: 404 });
    instructorId = parsed.data.instructorId;
  }

  const created = await prisma.instructorAvailability.create({
    data: {
      instructorId,
      startTime: start,
      endTime: end,
      notes: parsed.data.notes || null,
    },
    include: { instructor: { select: safeAvailabilityInstructorSelect } },
  });
  return NextResponse.json(created, { status: 201 });
}
