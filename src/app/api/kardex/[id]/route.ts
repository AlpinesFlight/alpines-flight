import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  date: z.string().optional(),
  hoursAt: z.number().nonnegative().nullable().optional(),
  cyclesAt: z.number().int().nonnegative().nullable().optional(),
  category: z.enum(["VISITE", "REPARATION", "CONSIGNE_NAVIGABILITE", "PIECE_REMPLACEE", "AUTRE"]).optional(),
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  performedBy: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
});

// Corriger une entrée kardex déjà saisie (faute de frappe, date erronée...).
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { date, ...rest } = parsed.data;
  const entry = await prisma.kardexEntry.update({
    where: { id },
    data: { ...rest, ...(date ? { date: new Date(date) } : {}) },
  });
  return NextResponse.json(entry);
}

// Suppression d'une entrée kardex saisie par erreur. Admin uniquement — en
// usage normal on préfère ajouter une entrée corrective plutôt que de
// réécrire l'historique, mais une faute de frappe doit pouvoir être retirée.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.kardexEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
