import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// Accusé de lecture d'une actualité réservée aux instructeurs, par le compte
// connecté. La date est fixée au PREMIER accusé, jamais réécrite : c'est
// elle qui sert de preuve en cas de contrôle (voir .../acknowledgments).
// Un instructeur arrivé après la publication (absent de la liste de
// diffusion d'origine) peut aussi confirmer — il est alors ajouté, comme
// pour les documents (voir /api/documents/[id]/acknowledge).
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: announcementId } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { audience: true },
  });
  if (!announcement || announcement.audience !== "INSTRUCTORS") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const existing = await prisma.announcementRecipient.findUnique({
    where: { announcementId_userId: { announcementId, userId: session.user.id } },
  });
  if (!existing && session.user.role !== "INSTRUCTOR") {
    return NextResponse.json({ error: "Cette actualité ne t'est pas destinée." }, { status: 403 });
  }
  if (existing?.acknowledgedAt) {
    return NextResponse.json({ acknowledgedAt: existing.acknowledgedAt });
  }

  const now = new Date();
  const receipt = existing
    ? await prisma.announcementRecipient.update({ where: { id: existing.id }, data: { acknowledgedAt: now } })
    : await prisma.announcementRecipient.create({
        data: { announcementId, userId: session.user.id, notifiedAt: now, acknowledgedAt: now },
      });
  return NextResponse.json({ acknowledgedAt: receipt.acknowledgedAt });
}
