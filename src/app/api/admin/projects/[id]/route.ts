import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

// Un projet donné, avec sa progression — les tâches elles-mêmes se
// récupèrent séparément via GET /api/admin/tasks?projectId=... (même
// composant GestionTasksView que la page Tâches globale, juste filtré).
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.adminProject.findUnique({
    where: { id },
    include: {
      createdBy: { select: safeUserSelect },
      tasks: { select: { status: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { tasks, ...rest } = project;
  return NextResponse.json({
    ...rest,
    taskCount: tasks.length,
    doneCount: tasks.filter((t) => t.status === "DONE").length,
  });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).optional(),
  dueDate: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const existing = await prisma.adminProject.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { dueDate, ...rest } = parsed.data;
  const project = await prisma.adminProject.update({
    where: { id },
    data: {
      ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    },
    include: {
      createdBy: { select: safeUserSelect },
      tasks: { select: { status: true } },
    },
  });

  const { tasks, ...projectRest } = project;
  return NextResponse.json({
    ...projectRest,
    taskCount: tasks.length,
    doneCount: tasks.filter((t) => t.status === "DONE").length,
  });
}

// Supprime le projet — jamais ses tâches (voir AdminTask.projectId,
// onDelete: SetNull dans le schéma) : elles redeviennent de simples tâches
// sans projet plutôt que d'être perdues.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.adminProject.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.adminProject.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
