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
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["TODO", "DOING", "DONE"]).optional(),
  projectId: z.string().nullable().optional(),
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

  const existing = await prisma.adminTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { dueDate, status, ...rest } = parsed.data;
  const task = await prisma.adminTask.update({
    where: { id },
    data: {
      ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(status !== undefined ? { status, completedAt: status === "DONE" ? new Date() : null } : {}),
    },
    include: { createdBy: { select: safeUserSelect }, project: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json(task);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.adminTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.adminTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
