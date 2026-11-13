import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { z } from "zod";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageFinance } from "@/lib/permissions";
import { safeTransactionAttachmentSelect } from "@/lib/selects";
import { deleteBlobQuietly, verifyTransactionAttachment } from "@/lib/transaction-attachment-blob";

type Params = { params: Promise<{ id: string }> };

// Justificatif d'un mouvement du compte pilote (facture de l'aéroport d'une
// taxe d'atterrissage). Lecture : le Gérant, et le pilote titulaire du
// compte — personne d'autre (Admin et instructeurs compris : les finances
// sont réservées au Gérant). Ajout, remplacement, retrait : Gérant seul.

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const transaction = await prisma.accountTransaction.findUnique({
    where: { id },
    select: { studentId: true, attachment: { select: { fileName: true, fileMimeType: true, blobUrl: true } } },
  });
  // 404 aussi quand ce n'est pas son compte : ne révèle pas l'existence du
  // mouvement d'un autre pilote.
  if (
    !transaction?.attachment ||
    (!canManageFinance(session.user.role) && transaction.studentId !== session.user.id)
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { fileName, fileMimeType, blobUrl } = transaction.attachment;
  const blob = await get(blobUrl, { access: "private" });
  if (!blob || blob.stream === null) {
    return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 404 });
  }
  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": fileMimeType || "application/octet-stream",
      // filename* : garde les accents du nom d'origine.
      "Content-Disposition": `inline; filename="${fileName.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

const attachSchema = z.object({
  fileName: z.string().min(1),
  blobUrl: z.string().url(),
});

// Ajoute ou remplace le justificatif (le fichier est déjà envoyé à Vercel
// Blob par le navigateur, voir /api/transactions/blob-upload).
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = attachSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const transaction = await prisma.accountTransaction.findUnique({
    where: { id },
    select: { id: true, attachment: { select: { blobUrl: true } } },
  });
  if (!transaction) return NextResponse.json({ error: "not found" }, { status: 404 });

  const file = await verifyTransactionAttachment(parsed.data.blobUrl, parsed.data.fileName);
  if (!file) {
    return NextResponse.json(
      { error: "Le justificatif est introuvable dans le stockage — réessaie l'envoi." },
      { status: 400 }
    );
  }

  const attachment = await prisma.accountTransactionAttachment.upsert({
    where: { transactionId: id },
    create: { transactionId: id, ...file },
    update: { ...file, uploadedAt: new Date() },
    select: safeTransactionAttachmentSelect,
  });
  // L'ancien fichier, remplacé : supprimé après l'écriture réussie.
  if (transaction.attachment && transaction.attachment.blobUrl !== file.blobUrl) {
    await deleteBlobQuietly(transaction.attachment.blobUrl, `ancien justificatif du mouvement ${id}`);
  }
  return NextResponse.json(attachment);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const attachment = await prisma.accountTransactionAttachment.findUnique({
    where: { transactionId: id },
    select: { id: true, blobUrl: true },
  });
  if (!attachment) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.accountTransactionAttachment.delete({ where: { id: attachment.id } });
  await deleteBlobQuietly(attachment.blobUrl, `justificatif du mouvement ${id}`);
  return NextResponse.json({ ok: true });
}
