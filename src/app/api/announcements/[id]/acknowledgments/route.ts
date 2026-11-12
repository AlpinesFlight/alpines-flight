import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// Preuve de diffusion d'une actualité réservée aux instructeurs : à qui elle
// a été diffusée (liste figée à la publication), qui a confirmé l'avoir lue
// et quand. Réservé à la gestion (Gérant/Admin). Version imprimable :
// /actualites/[id]/preuve.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, title: true, audience: true, createdAt: true, createdBy: { select: safeUserSelect } },
  });
  if (!announcement) return NextResponse.json({ error: "not found" }, { status: 404 });

  const recipients = await prisma.announcementRecipient.findMany({
    where: { announcementId: id },
    select: { user: { select: safeUserSelect }, notifiedAt: true, acknowledgedAt: true },
    orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
  });

  return NextResponse.json({ announcement, recipients });
}
