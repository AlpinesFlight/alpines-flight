import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAvailabilityInstructorSelect } from "@/lib/selects";
import { zodErrorMessage } from "@/lib/api-errors";
import { canSeeInstructorAvailability, isGerant } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().nullable().optional(),
});

// Un instructeur ne modifie que ses propres créneaux ; le Gérant peut
// aussi le faire pour n'importe qui (utile pour corriger une saisie sans
// avoir à demander au FI concerné).
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canSeeInstructorAvailability(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.instructorAvailability.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.instructorId !== session.user.id && !isGerant(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const start = parsed.data.startTime ? new Date(parsed.data.startTime) : existing.startTime;
  const end = parsed.data.endTime ? new Date(parsed.data.endTime) : existing.endTime;
  if (end <= start) {
    return NextResponse.json(
      { error: "L'heure de fin doit être après l'heure de début." },
      { status: 400 }
    );
  }

  const updated = await prisma.instructorAvailability.update({
    where: { id },
    data: { startTime: start, endTime: end, notes: parsed.data.notes },
    include: { instructor: { select: safeAvailabilityInstructorSelect } },
  });
  return NextResponse.json(updated);
}

// Même règle que PATCH : chacun supprime les siens, le Gérant supprime
// n'importe lequel (nettoyage administratif).
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canSeeInstructorAvailability(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.instructorAvailability.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.instructorId !== session.user.id && !isGerant(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.instructorAvailability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
