import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// Preuve de diffusion/lecture pour un document — qui a été notifié, qui a
// confirmé et quand. Sert de justificatif en cas de contrôle DGAC. Réservé
// à l'Admin/Gérant (gestion de l'école).
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: documentId } = await params;
  const document = await prisma.schoolDocument.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, category: true, uploadedAt: true },
  });
  if (!document) return NextResponse.json({ error: "not found" }, { status: 404 });

  const notifications = await prisma.documentNotification.findMany({
    where: { documentId },
    select: { user: { select: safeUserSelect }, notifiedAt: true, acknowledgedAt: true },
    orderBy: [{ acknowledgedAt: "desc" }, { user: { lastName: "asc" } }],
  });

  return NextResponse.json({ document, notifications });
}
