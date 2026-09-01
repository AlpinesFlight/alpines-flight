import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string; aircraftId: string }> };

const putSchema = z.object({
  customRateCents: z.number().int().positive("Le tarif doit être un montant positif."),
});

// Active ou met à jour un tarif avion personnalisé pour ce pilote/élève —
// dérogation au tarif standard de l'avion, réservée au Gérant (voir
// PilotAircraftRate). Utilisée dès la prochaine clôture de vol sur cet
// avion pour ce pilote, voir /api/reservations/[id]/complete.
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: studentId, aircraftId } = await params;

  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const [student, aircraft] = await Promise.all([
    prisma.studentProfile.findUnique({ where: { userId: studentId } }),
    prisma.aircraft.findUnique({ where: { id: aircraftId } }),
  ]);
  if (!student) return NextResponse.json({ error: "Pilote/élève introuvable." }, { status: 404 });
  if (!aircraft) return NextResponse.json({ error: "Avion introuvable." }, { status: 404 });

  const rate = await prisma.pilotAircraftRate.upsert({
    where: { studentId_aircraftId: { studentId, aircraftId } },
    create: {
      studentId,
      aircraftId,
      customRateCents: parsed.data.customRateCents,
      setById: session.user.id,
    },
    update: {
      customRateCents: parsed.data.customRateCents,
      setById: session.user.id,
    },
  });
  return NextResponse.json(rate);
}

// Retire la dérogation — le pilote retombe sur le tarif standard de
// l'avion dès la prochaine clôture de vol.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: studentId, aircraftId } = await params;

  await prisma.pilotAircraftRate.deleteMany({ where: { studentId, aircraftId } });
  return NextResponse.json({ ok: true });
}
