import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalcAircraftMaintenanceStatuses } from "@/lib/maintenance";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const records = await prisma.maintenanceRecord.findMany({
    include: { aircraft: true },
    orderBy: [{ status: "asc" }, { dueAtDate: "asc" }],
  });
  return NextResponse.json(records);
}

const createSchema = z
  .object({
    aircraftId: z.string(),
    label: z.string().min(2),
    type: z.enum(["HOURLY", "CALENDAR", "CYCLES"]),
    dueAtHours: z.number().optional().nullable(),
    dueAtDate: z.string().optional().nullable(),
    dueAtCycles: z.number().int().optional().nullable(),
    alertBefore: z.number().default(10),
    notes: z.string().optional().nullable(),
  })
  .refine(
    (d) =>
      (d.type === "HOURLY" && d.dueAtHours != null) ||
      (d.type === "CALENDAR" && d.dueAtDate != null) ||
      (d.type === "CYCLES" && d.dueAtCycles != null),
    { message: "L'échéance doit correspondre au type choisi (heures, date ou cycles)." }
  );

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { dueAtDate, aircraftId, ...rest } = parsed.data;
  const record = await prisma.maintenanceRecord.create({
    data: { ...rest, aircraftId, dueAtDate: dueAtDate ? new Date(dueAtDate) : null },
  });

  // Fixe le statut initial (UPCOMING/DUE/OVERDUE) selon les compteurs actuels
  // de l'avion plutôt que de laisser le défaut UPCOMING dans tous les cas.
  await recalcAircraftMaintenanceStatuses(prisma, aircraftId);
  const fresh = await prisma.maintenanceRecord.findUnique({ where: { id: record.id } });

  return NextResponse.json(fresh, { status: 201 });
}
