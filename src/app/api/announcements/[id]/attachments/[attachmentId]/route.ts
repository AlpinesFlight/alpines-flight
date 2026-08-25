import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    select: { announcementId: true, fileName: true, fileMimeType: true, fileData: true },
  });
  if (!attachment || attachment.announcementId !== id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(attachment.fileData), {
    headers: {
      "Content-Type": attachment.fileMimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${attachment.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
