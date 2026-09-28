import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { get } from "@vercel/blob";

type Params = { params: Promise<{ id: string }> };

// Sert le contenu binaire d'un document (photo/scan/PDF de licence,
// médicale...). Jamais exposé en statique public — ce sont des documents
// personnels — donc servi uniquement ici, après vérification des droits :
// admin, ou la personne concernée par la qualification.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.qualificationDocument.findUnique({
    where: { id },
    include: { qualification: true },
  });
  if (!doc || (!doc.fileData && !doc.blobUrl)) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!canManageSchool(session.user.role) && doc.qualification.userId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const disposition = `inline; filename="${(doc.fileName || "document").replace(/"/g, "")}"`;

  if (doc.blobUrl) {
    const blob = await get(doc.blobUrl, { access: "private" });
    if (!blob || blob.stream === null) {
      return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 404 });
    }
    return new NextResponse(blob.stream, {
      headers: {
        "Content-Type": doc.fileMimeType || "application/octet-stream",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(new Uint8Array(doc.fileData!), {
    headers: {
      "Content-Type": doc.fileMimeType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
