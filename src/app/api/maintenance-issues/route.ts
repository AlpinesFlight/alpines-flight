import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAircraftSelect, safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

// Le Gérant voit tous les signalements (pour les traiter) ; tout autre
// compte ne voit que les siens (pour suivre où en est ce qu'il a remonté) —
// voir le bloc "Retour maintenance" du tableau de bord.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const issues = await prisma.maintenanceIssue.findMany({
    where: isGerant(session.user.role) ? undefined : { reportedById: session.user.id },
    select: {
      id: true,
      aircraftId: true,
      aircraft: { select: safeAircraftSelect },
      description: true,
      status: true,
      createdAt: true,
      reportedById: true,
      reportedBy: { select: safeUserSelect },
      resolvedAt: true,
      resolvedById: true,
      resolvedBy: { select: safeUserSelect },
      resolutionNotes: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(issues);
}

const createSchema = z.object({
  aircraftId: z.string(),
  description: z.string().min(3, "Décris le défaut en quelques mots."),
});

// N'importe quel compte connecté peut signaler un défaut — pas réservé aux
// pilotes au sens strict (isPilot) : un instructeur ou l'admin qui remarque
// quelque chose en vol doit pouvoir le remonter aussi.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const issue = await prisma.maintenanceIssue.create({
    data: {
      aircraftId: parsed.data.aircraftId,
      description: parsed.data.description,
      reportedById: session.user.id,
    },
    select: {
      id: true,
      aircraftId: true,
      aircraft: { select: safeAircraftSelect },
      description: true,
      status: true,
      createdAt: true,
      reportedById: true,
      reportedBy: { select: safeUserSelect },
      resolvedAt: true,
      resolvedById: true,
      resolvedBy: { select: safeUserSelect },
      resolutionNotes: true,
    },
  });
  return NextResponse.json(issue, { status: 201 });
}
