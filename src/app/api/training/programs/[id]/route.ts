import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const program = await prisma.trainingProgram.findUnique({
    where: { id },
    include: {
      phases: {
        orderBy: { order: "asc" },
        include: { exercises: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!program) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(program);
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  modality: z.string().nullable().optional(),
  referenceReglementaire: z.string().nullable().optional(),
  sanction: z.string().nullable().optional(),
  volumeLabel: z.string().nullable().optional(),
  active: z.boolean().optional(),
  instructionRateCents: z.number().int().positive().nullable().optional(),
});

// Édite un programme — nom, tarif d'instruction (voir
// /api/reservations/[id]/complete), ou `active` (désactivation "douce" :
// disparaît des listes actives mais reste relié à l'historique existant,
// utilisé quand une suppression franche est refusée ci-dessous). Admin
// uniquement.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.code) {
    const dup = await prisma.trainingProgram.findUnique({ where: { code: parsed.data.code } });
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: "Ce code de programme est déjà utilisé." }, { status: 409 });
    }
  }

  const program = await prisma.trainingProgram.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(program);
}

// Suppression franche — refusée (409) si le programme a déjà servi
// (inscriptions, réservations ou vols reliés), pour ne jamais perdre
// d'historique de formation ou de facturation ; désactive-le via
// PATCH {active:false} à la place dans ce cas. Admin uniquement.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const program = await prisma.trainingProgram.findUnique({ where: { id } });
  if (!program) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [enrollments, reservations, flightLogs] = await Promise.all([
    prisma.enrollment.count({ where: { programId: id } }),
    prisma.reservation.count({ where: { trainingProgramId: id } }),
    prisma.flightLog.count({ where: { trainingProgramId: id } }),
  ]);
  if (enrollments > 0 || reservations > 0 || flightLogs > 0) {
    return NextResponse.json(
      {
        error:
          "Ce programme a déjà des inscriptions, réservations ou vols reliés — impossible de le supprimer sans perdre cet historique. Désactive-le plutôt (il disparaîtra des listes actives).",
      },
      { status: 409 }
    );
  }

  await prisma.trainingProgram.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
