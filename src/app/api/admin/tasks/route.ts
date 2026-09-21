import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

// Check-list de tâches internes (page /gestion) — réservée au Gérant.
// Toujours tout renvoyé (le volume attendu reste faible, pas de pagination) ;
// le tri (à faire d'abord, échéance/priorité) se fait côté client selon la
// vue choisie.
export async function GET() {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tasks = await prisma.adminTask.findMany({
    include: { createdBy: { select: safeUserSelect } },
    orderBy: [{ done: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(tasks);
}

const createSchema = z.object({
  title: z.string().min(1, "Le titre est requis."),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional().default("MEDIUM"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { title, description, dueDate, priority } = parsed.data;
  const task = await prisma.adminTask.create({
    data: {
      title,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority,
      createdById: session.user.id,
    },
    include: { createdBy: { select: safeUserSelect } },
  });
  return NextResponse.json(task, { status: 201 });
}
