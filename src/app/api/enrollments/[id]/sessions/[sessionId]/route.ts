import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string; sessionId: string }> };

const schema = z.object({
  date: z.string().optional(),
  aircraftId: z.string().nullable().optional(),
  flightLogId: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  entries: z
    .array(
      z.object({
        exerciseId: z.string(),
        level: z.enum(["NON_VU", "VU", "ASSIMILE"]),
        notes: z.string().optional().nullable(),
      })
    )
    .optional(),
});

// Modifier une séance déjà saisie : tout FI (pas seulement celui qui l'a
// enregistrée — un autre FI peut avoir besoin de corriger une erreur de
// saisie d'un collègue) ou le Gérant/Admin. Jamais l'élève.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: enrollmentId, sessionId } = await params;
  const existing = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
  if (!existing || existing.enrollmentId !== enrollmentId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!isInstructorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { date, aircraftId, flightLogId, remarks, entries } = parsed.data;

  const updated = await prisma.$transaction(async (db) => {
    const trainingSession = await db.trainingSession.update({
      where: { id: sessionId },
      data: {
        ...(date ? { date: new Date(date) } : {}),
        ...(aircraftId !== undefined ? { aircraftId } : {}),
        ...(flightLogId !== undefined ? { flightLogId } : {}),
        ...(remarks !== undefined ? { remarks } : {}),
      },
    });

    if (entries) {
      // Remplace intégralement les exercices notés pour cette séance.
      await db.exerciseProgress.deleteMany({ where: { sessionId } });
      for (const entry of entries) {
        await db.exerciseProgress.create({
          data: {
            enrollmentId,
            exerciseId: entry.exerciseId,
            sessionId,
            level: entry.level,
            date: trainingSession.date,
            instructorId: existing.instructorId,
            notes: entry.notes || null,
          },
        });
      }
    }

    return db.trainingSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        instructor: { select: safeUserSelect },
        aircraft: { select: safeAircraftSelect },
        // include (pas juste true) : le front lit flightLog.aircraft.registration.
        flightLog: { include: { aircraft: { select: safeAircraftSelect } } },
        progress: { include: { exercise: true } },
      },
    });
  });

  return NextResponse.json(updated);
}
