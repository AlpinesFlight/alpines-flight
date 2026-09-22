import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

// Liste des projets (page /gestion/projets) — réservée au Gérant. Le
// nombre de tâches et la progression (% DONE) sont toujours recalculés à
// la volée depuis AdminTask, jamais stockés sur AdminProject, pour ne
// jamais désynchroniser.
export async function GET() {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const projects = await prisma.adminProject.findMany({
    include: {
      createdBy: { select: safeUserSelect },
      tasks: { select: { status: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  const withProgress = projects.map(({ tasks, ...p }) => ({
    ...p,
    taskCount: tasks.length,
    doneCount: tasks.filter((t) => t.status === "DONE").length,
  }));

  return NextResponse.json(withProgress);
}

const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  description: z.string().optional().nullable(),
  color: z.string().optional(),
  dueDate: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { name, description, color, dueDate } = parsed.data;
  const project = await prisma.adminProject.create({
    data: {
      name,
      description: description || null,
      color: color || undefined,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: session.user.id,
    },
    include: { createdBy: { select: safeUserSelect } },
  });

  return NextResponse.json({ ...project, taskCount: 0, doneCount: 0 }, { status: 201 });
}
