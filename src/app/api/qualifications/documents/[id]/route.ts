import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { del } from "@vercel/blob";

type Params = { params: Promise<{ id: string }> };

// Retire un justificatif (mauvais fichier, doublon...). Les qualifications
// qu'il justifiait restent au dossier, simplement sans ce document.
// Autorisé pour le staff, ou pour la personne qui l'a importé tant que rien
// de ce qu'il justifie n'a encore été validé (une fois pris en compte, seul
// le staff peut le retirer, pour garder la trace).
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.pilotDocument.findUnique({
    where: { id },
    include: { validities: { select: { status: true } } },
  });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isUploader = doc.uploadedById === session.user.id;
  const onlyPending = doc.validities.every((v) => v.status === "PENDING" || v.status === "REJECTED");
  if (!canManageSchool(session.user.role)) {
    if (!isUploader) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!onlyPending) {
      return NextResponse.json(
        { error: "Ce document justifie une qualification déjà validée : seule l'école peut le retirer." },
        { status: 403 }
      );
    }
  }

  await prisma.$transaction([
    prisma.pilotDocument.delete({ where: { id } }),
    // Fichiers repris de l'ancien stockage (voir la migration
    // licences_justificatifs) : la validité d'origine — même id — en garde
    // une copie dans ses anciennes colonnes, plus utilisées. Vidées aussi,
    // pour que le document disparaisse vraiment.
    prisma.qualificationValidity.updateMany({
      where: { OR: [{ id }, ...(doc.blobUrl ? [{ blobUrl: doc.blobUrl }] : [])] },
      data: { fileName: null, fileMimeType: null, fileSize: null, fileData: null, blobUrl: null },
    }),
  ]);

  if (doc.blobUrl && (await prisma.pilotDocument.count({ where: { blobUrl: doc.blobUrl } })) === 0) {
    try {
      await del(doc.blobUrl);
    } catch (err) {
      console.error(`Suppression du fichier Blob du justificatif ${id} échouée :`, err);
    }
  }

  return NextResponse.json({ ok: true });
}
