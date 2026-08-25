import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: {
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
      program: {
        include: { phases: { orderBy: { order: "asc" }, include: { exercises: { orderBy: { order: "asc" } } } } },
      },
      // Historique complet (le plus récent en premier) : le front en déduit
      // le niveau courant de chaque exercice (première occurrence par exerciseId).
      progress: {
        orderBy: { date: "desc" },
        include: { instructor: { select: safeUserSelect } },
      },
      sessions: {
        orderBy: { date: "desc" },
        include: {
          instructor: { select: safeUserSelect },
          aircraft: true,
          flightLog: true,
          progress: { include: { exercise: true } },
        },
      },
    },
  });
  if (!enrollment) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (session.user.role === "STUDENT" && enrollment.studentId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(enrollment);
}

const patchSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED", "ABANDONED", "SUSPENDED"]).optional(),
  instructorId: z.string().nullable().optional(),
  targetExamDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isInstructorOrAbove(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { targetExamDate, status, ...rest } = parsed.data;
  const isTerminal = status && status !== "IN_PROGRESS";

  const enrollment = await prisma.enrollment.update({
    where: { id },
    data: {
      ...rest,
      ...(status ? { status } : {}),
      ...(targetExamDate !== undefined
        ? { targetExamDate: targetExamDate ? new Date(targetExamDate) : null }
        : {}),
      // Clôture (Terminée/Abandonnée/Suspendue) → horodate ; retour à "En
      // cours" → efface la date de clôture.
      ...(status ? { completedAt: isTerminal ? new Date() : null } : {}),
    },
  });
  return NextResponse.json(enrollment);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.enrollment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
