import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  // Libellé : seulement pour une qualification hors catalogue — celles du
  // catalogue gardent le libellé de référence.
  label: z.string().trim().min(1).optional(),
  reminderDaysBefore: z.number().int().positive().max(730).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const existing = await prisma.qualification.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const qualification = await prisma.qualification.update({
    where: { id },
    data: {
      ...(parsed.data.label && !existing.kind ? { label: parsed.data.label } : {}),
      ...(parsed.data.reminderDaysBefore ? { reminderDaysBefore: parsed.data.reminderDaysBefore } : {}),
    },
  });
  return NextResponse.json(qualification);
}

// Supprime la qualification et tout son historique de validités — les
// justificatifs restent au dossier de la personne (ils peuvent servir à
// d'autres qualifications).
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  // Détache d'abord le pointeur "validité courante" pour éviter tout conflit
  // avec la contrainte de clé étrangère avant la suppression en cascade.
  await prisma.qualification.update({ where: { id }, data: { currentValidityId: null } });
  await prisma.qualification.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
