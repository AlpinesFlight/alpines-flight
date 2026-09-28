import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInstructorOrAbove } from "@/lib/permissions";
import { get } from "@vercel/blob";

type Params = { params: Promise<{ id: string }> };

// Diffuse le contenu binaire d'un document — jamais en JSON (voir
// safeSchoolDocumentSelect). Réapplique la règle de visibilité : un document
// FI_ONLY ne doit pas être accessible à un élève même en devinant son id.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.schoolDocument.findUnique({
    where: { id },
    select: { fileData: true, fileMimeType: true, fileName: true, visibility: true, blobUrl: true },
  });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (doc.visibility === "FI_ONLY" && !isInstructorOrAbove(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const disposition = `inline; filename="${doc.fileName.replace(/"/g, "")}"`;
  // Jamais de cache navigateur : un document FI_ONLY ne doit pas rester
  // servable depuis le cache disque après déconnexion, sur un poste
  // partagé — même politique que les documents de qualification
  // (contrairement aux photos d'avion, non sensibles).
  const cacheControl = "private, no-store";

  if (doc.blobUrl) {
    const blob = await get(doc.blobUrl, { access: "private" });
    if (!blob || blob.stream === null) {
      return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 404 });
    }
    return new NextResponse(blob.stream, {
      headers: {
        "Content-Type": doc.fileMimeType || "application/octet-stream",
        "Content-Disposition": disposition,
        "Cache-Control": cacheControl,
      },
    });
  }

  if (!doc.fileData) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(doc.fileData), {
    headers: {
      "Content-Type": doc.fileMimeType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": cacheControl,
    },
  });
}
