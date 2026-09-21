import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
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

  const existing = await prisma.adminEvent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { startTime, endTime, ...rest } = parsed.data;
  const event = await prisma.adminEvent.update({
    where: { id },
    data: {
      ...rest,
      ...(startTime ? { startTime: new Date(startTime) } : {}),
      ...(endTime !== undefined ? { endTime: endTime ? new Date(endTime) : null } : {}),
    },
    include: { createdBy: { select: safeUserSelect } },
  });
  return NextResponse.json(event);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.adminEvent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.adminEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
