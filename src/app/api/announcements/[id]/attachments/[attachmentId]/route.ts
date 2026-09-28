import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { get } from "@vercel/blob";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

// Diffuse un document joint à une actualité, en streaming — jamais en JSON
// (voir safeAnnouncementAttachmentSelect). Accessible à tout utilisateur
// connecté, comme l'actualité elle-même.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, attachmentId } = await params;
  const attachment = await prisma.announcementAttachment.findUnique({
    where: { id: attachmentId },
    select: { announcementId: true, fileName: true, fileMimeType: true, fileData: true, blobUrl: true },
  });
  if (!attachment || attachment.announcementId !== id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const disposition = `inline; filename="${attachment.fileName.replace(/"/g, "")}"`;

  if (attachment.blobUrl) {
    const blob = await get(attachment.blobUrl, { access: "private" });
    if (!blob || blob.stream === null) {
      return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 404 });
    }
    return new NextResponse(blob.stream, {
      headers: {
        "Content-Type": attachment.fileMimeType || "application/octet-stream",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (!attachment.fileData) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(attachment.fileData), {
    headers: {
      "Content-Type": attachment.fileMimeType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
