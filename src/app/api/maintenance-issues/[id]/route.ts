import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAircraftSelect, safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  resolutionNotes: z.string().optional().nullable(),
});

// Clôture un signalement — Gérant uniquement. Pas de réouverture ni
// d'édition du texte d'origine (l'auteur ne peut pas modifier son
// signalement une fois envoyé, pour garder une trace fidèle de ce qui a été
// remonté).
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.maintenanceIssue.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const issue = await prisma.maintenanceIssue.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedById: session.user.id,
      resolutionNotes: parsed.data.resolutionNotes || null,
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
  return NextResponse.json(issue);
}
