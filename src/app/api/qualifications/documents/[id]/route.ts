import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// Retire un document importé par erreur. Autorisé pour l'admin, ou pour
// celui qui l'a importé tant qu'il n'a pas encore été validé/rejeté (une
// fois traité, seul l'admin peut le retirer, pour garder la trace).
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.qualificationDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isUploader = doc.uploadedById === session.user.id;
  const canDelete = canManageSchool(session.user.role) || (isUploader && doc.status === "PENDING");
  if (!canDelete) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Si c'était le document courant, détache le pointeur avant suppression.
  await prisma.qualification.updateMany({
    where: { currentDocumentId: id },
    data: { currentDocumentId: null },
  });
  await prisma.qualificationDocument.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
