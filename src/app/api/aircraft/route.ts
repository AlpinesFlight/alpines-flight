import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAircraftSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const aircraft = await prisma.aircraft.findMany({
    select: { ...safeAircraftSelect, maintenanceRecords: true },
    orderBy: { registration: "asc" },
  });
  return NextResponse.json(aircraft);
}

const createSchema = z.object({
  registration: z.string().min(2),
  type: z.string().min(2),
  hourlyRateCents: z.number().int().positive(),
  totalHours: z.number().nonnegative().default(0),
  totalCycles: z.number().int().nonnegative().default(0),
  color: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const aircraft = await prisma.aircraft.create({ data: parsed.data, select: safeAircraftSelect });
  return NextResponse.json(aircraft, { status: 201 });
}
