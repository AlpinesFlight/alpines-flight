import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const instructor = await prisma.user.findUnique({
    where: { id },
    select: {
      ...safeUserSelect,
      instructorProfile: true,
      reservationsAsInstructor: {
        include: { aircraft: { select: safeAircraftSelect }, student: { select: safeUserSelect } },
        orderBy: { startTime: "desc" },
        take: 20,
      },
      flightsAsInstructor: {
        include: { aircraft: { select: safeAircraftSelect }, student: { select: safeUserSelect } },
        orderBy: { date: "desc" },
        take: 20,
      },
    },
  });
  if (!instructor) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(instructor);
}

const patchSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  qualifications: z.string().nullable().optional(),
  hourlyRateCents: z.number().int().positive().nullable().optional(),
  color: z.string().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  if (parsed.data.email) {
    const dup = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 });
    }
  }

  const { qualifications, hourlyRateCents, color, ...userFields } = parsed.data;

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...userFields,
      instructorProfile: {
        update: { qualifications, hourlyRateCents, color },
      },
    },
    select: { ...safeUserSelect, instructorProfile: true },
  });
  return NextResponse.json(user);
}
