import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  type: z
    .enum([
      "LICENSE",
      "MEDICAL",
      "CLASS_RATING",
      "VARIANT",
      "ADDITIONAL",
      "INSTRUCTOR_PRIV",
      "EXAMINER_PRIV",
      "OTHER",
    ])
    .optional(),
  label: z.string().min(1).optional(),
  reminderDaysBefore: z.number().int().positive().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const qualification = await prisma.qualification.update({ where: { id }, data: parsed.data });
  return NextResponse.json(qualification);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  // Détache d'abord le pointeur "document courant" pour éviter tout conflit
  // avec la contrainte de clé étrangère avant la suppression en cascade.
  await prisma.qualification.update({ where: { id }, data: { currentDocumentId: null } });
  await prisma.qualification.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
