import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { safeAircraftSelect } from "@/lib/selects";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const aircraftId = searchParams.get("aircraftId");

  const entries = await prisma.kardexEntry.findMany({
    where: aircraftId ? { aircraftId } : undefined,
    include: { aircraft: { select: safeAircraftSelect }, maintenanceRecord: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(entries);
}

const createSchema = z.object({
  aircraftId: z.string(),
  date: z.string(),
  hoursAt: z.number().nonnegative().optional().nullable(),
  cyclesAt: z.number().int().nonnegative().optional().nullable(),
  category: z.enum([
    "VISITE",
    "REPARATION",
    "CONSIGNE_NAVIGABILITE",
    "PIECE_REMPLACEE",
    "AUTRE",
  ]),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  performedBy: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
});

// Ajout manuel d'une entrée au kardex (ex: import de l'historique papier,
// intervention non liée à une échéance planifiée). Admin uniquement.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { date, ...rest } = parsed.data;
  const entry = await prisma.kardexEntry.create({
    data: { ...rest, date: new Date(date), createdById: session.user.id },
  });
  return NextResponse.json(entry, { status: 201 });
}
