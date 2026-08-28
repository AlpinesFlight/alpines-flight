import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// Confirmation de lecture par l'utilisateur courant — accessible même si le
// document a été publié avant son arrivée (pas seulement aux destinataires
// notifiés à l'origine, voir notifyNewDocument). C'est cette date qui sert
// de preuve en cas de contrôle DGAC (voir GET .../acknowledgments).
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: documentId } = await params;
  const document = await prisma.schoolDocument.findUnique({ where: { id: documentId } });
  if (!document) return NextResponse.json({ error: "not found" }, { status: 404 });

  const notification = await prisma.documentNotification.upsert({
    where: { documentId_userId: { documentId, userId: session.user.id } },
    create: { documentId, userId: session.user.id, acknowledgedAt: new Date() },
    update: { acknowledgedAt: new Date() },
  });

  return NextResponse.json({ acknowledgedAt: notification.acknowledgedAt });
}
