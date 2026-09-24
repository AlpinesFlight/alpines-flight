import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeTheoryClassSelect, safeTheoryClassDocumentSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const detailSelect = { ...safeTheoryClassSelect, documents: { select: safeTheoryClassDocumentSelect } };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const theoryClass = await prisma.theoryClass.findUnique({ where: { id }, select: detailSelect });
  if (!theoryClass) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(theoryClass);
}

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
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

  const existing = await prisma.theoryClass.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const theoryClass = await prisma.theoryClass.update({
    where: { id },
    data: parsed.data,
    select: detailSelect,
  });
  return NextResponse.json(theoryClass);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.theoryClass.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.theoryClass.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
