import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
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
        level: z.enum(["NON_VU", "VU", "ASSIMILE", "NIVEAU_CIBLE"]),
        notes: z.string().optional().nullable(),
      })
    )
    .optional(),
});

// Modifier une séance déjà validée : réservé à l'admin, ou au FI qui l'a
// lui-même saisie (pas un autre instructeur, pas l'élève).
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: enrollmentId, sessionId } = await params;
  const existing = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
  if (!existing || existing.enrollmentId !== enrollmentId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const isOwner = session.user.role === "INSTRUCTOR" && existing.instructorId === session.user.id;
  if (!canManageSchool(session.user.role) && !isOwner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

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
        aircraft: true,
        flightLog: true,
        progress: { include: { exercise: true } },
      },
    });
  });

  return NextResponse.json(updated);
}
