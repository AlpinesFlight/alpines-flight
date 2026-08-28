import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  date: z.string(),
  instructorId: z.string().optional(), // admin peut saisir pour le compte d'un autre FI
  aircraftId: z.string().optional().nullable(),
  flightLogId: z.string().optional().nullable(), // vol relié, pour le résumé d'heures par phase
  remarks: z.string().optional().nullable(),
  entries: z
    .array(
      z.object({
        exerciseId: z.string(),
        level: z.enum(["NON_VU", "VU", "ASSIMILE", "NIVEAU_CIBLE"]),
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { date, aircraftId, flightLogId, remarks, entries } = parsed.data;
  const instructorId = parsed.data.instructorId || session.user.id;
  const sessionDate = new Date(date);

  const created = await prisma.$transaction(async (db) => {
    const trainingSession = await db.trainingSession.create({
      data: {
        enrollmentId,
        date: sessionDate,
        instructorId,
        aircraftId: aircraftId || null,
        flightLogId: flightLogId || null,
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
        flightLog: true,
        progress: { include: { exercise: true } },
      },
    });
  });

  return NextResponse.json(created, { status: 201 });
}
