import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInstructorOrAbove } from "@/lib/permissions";
import { get } from "@vercel/blob";

type Params = { params: Promise<{ id: string }> };

// Sert le contenu d'un justificatif (photo/scan/PDF de licence, médical...).
// Jamais exposé en statique public — ce sont des documents personnels —
// donc servi uniquement ici, après vérification des droits : staff
// pédagogique (FI, Admin, Gérant — un FI doit pouvoir vérifier la licence et
// le médical d'un élève avant de voler avec lui, demande du Gérant
// 2026-11-12), ou la personne concernée. Lecture seule : envoyer, valider ou
// supprimer un justificatif passe par d'autres routes, inchangées.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.pilotDocument.findUnique({ where: { id } });
  if (!doc || (!doc.fileData && !doc.blobUrl)) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!isInstructorOrAbove(session.user.role) && doc.userId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // filename* (UTF-8) pour le vrai nom ; filename en ASCII seul en secours —
  // un en-tête HTTP n'accepte pas tous les caractères (une apostrophe
  // typographique dans un nom de fichier suffisait à faire échouer la
  // réponse).
  const name = doc.fileName || "document";
  const asciiName = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "") || "document";
  const headers = {
    "Content-Type": doc.fileMimeType || "application/octet-stream",
    "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "private, no-store",
  };

  if (doc.blobUrl) {
    const blob = await get(doc.blobUrl, { access: "private" });
    if (!blob || blob.stream === null) {
      return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 404 });
    }
    return new NextResponse(blob.stream, { headers });
  }

  return new NextResponse(new Uint8Array(doc.fileData!), { headers });
}
