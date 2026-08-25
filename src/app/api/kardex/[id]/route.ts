import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

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
