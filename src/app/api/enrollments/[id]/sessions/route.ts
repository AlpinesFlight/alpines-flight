import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  date: z.string().optional(), // ignorée : la date est celle du vol relié
  instructorId: z.string().optional(), // admin peut saisir pour le compte d'un autre FI
  flightLogId: z.string().optional().nullable(), // vol relié (obligatoire, vérifié plus bas)
  remarks: z.string().optional().nullable(),
  entries: z
    .array(
      z.object({
        exerciseId: z.string(),
        level: z.enum(["NON_VU", "VU", "ASSIMILE"]),
        notes: z.string().optional().nullable(),
      })
    )
    .min(1, "Au moins un exercice doit être renseigné."),
});

// Enregistre une séance : le FI note, pour chaque exercice travaillé, le
// niveau atteint (reprend la notation du livret de progression papier).
// Seuls ADMIN/INSTRUCTOR peuvent noter — un élève ne peut pas s'auto-évaluer.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isInstructorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: enrollmentId } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { flightLogId, remarks, entries } = parsed.data;
  const instructorId = parsed.data.instructorId || session.user.id;

  // Toute séance est reliée à un vol (sinon pas d'heures par phase, ni de
  // date/avion fiables).
  if (!flightLogId) {
    return NextResponse.json({ error: "Une séance doit être reliée à un vol." }, { status: 400 });
  }

  // La séance prend la date (et l'heure) de départ et l'avion du vol relié,
  // quelles que soient les valeurs envoyées : c'est le vol qui fait foi, pas
  // le moment où le FI a rempli la fiche (souvent bien après le vol).
  const flight = await prisma.flightLog.findUnique({
    where: { id: flightLogId },
    select: { departureTime: true, aircraftId: true },
  });
  if (!flight) return NextResponse.json({ error: "Vol introuvable." }, { status: 400 });
  const sessionDate = flight.departureTime;

  const created = await prisma.$transaction(async (db) => {
    const trainingSession = await db.trainingSession.create({
      data: {
        enrollmentId,
        date: sessionDate,
        instructorId,
        aircraftId: flight.aircraftId,
        flightLogId,
        remarks: remarks || null,
      },
    });

    for (const entry of entries) {
      await db.exerciseProgress.create({
        data: {
          enrollmentId,
          exerciseId: entry.exerciseId,
          sessionId: trainingSession.id,
          level: entry.level,
          date: sessionDate,
          instructorId,
          notes: entry.notes || null,
        },
      });
    }

    return db.trainingSession.findUniqueOrThrow({
      where: { id: trainingSession.id },
      include: {
        instructor: { select: safeUserSelect },
        aircraft: { select: safeAircraftSelect },
        // include (pas juste true) : le front lit flightLog.aircraft.registration.
        flightLog: { include: { aircraft: { select: safeAircraftSelect } } },
        progress: { include: { exercise: true } },
      },
    });
  });

  return NextResponse.json(created, { status: 201 });
}
