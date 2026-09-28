import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeSchoolDocumentSelect } from "@/lib/selects";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";
import { notifyNewDocument } from "@/lib/document-emails";
import { head } from "@vercel/blob";
import { z } from "zod";

// Documentation de l'école (procédures, manuels, réglementation...). Un
// élève/pilote ne voit que les documents ALL ; le staff pédagogique (FI et
// au-dessus) voit aussi les documents FI_ONLY (ex. notes internes,
// procédures d'instruction) — voir SchoolDocument.visibility.
// ?archived=true bascule sur les documents archivés (voir archived
// ci-dessous) plutôt que les actifs — jamais les deux mélangés, pour que
// la liste principale reste celle qu'on utilise au quotidien.
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const staff = isInstructorOrAbove(session.user.role);
  const { searchParams } = new URL(req.url);
  const archived = searchParams.get("archived") === "true";
  // Les archives (anciennes versions, procédures périmées...) ne sont
  // montrées qu'à qui peut les gérer — les montrer à tout le monde
  // risquerait de faire lire une version périmée par erreur.
  if (archived && !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const documents = await prisma.schoolDocument.findMany({
    where: {
      archived,
      ...(staff ? {} : { visibility: "ALL" }),
    },
    select: {
      ...safeSchoolDocumentSelect,
      notifications: {
        where: { userId: session.user.id },
        select: { acknowledgedAt: true },
      },
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });

  // Aplati notifications (au plus 1 ligne, pour l'utilisateur courant) en un
  // simple champ — plus pratique côté client qu'un tableau à 0 ou 1 élément.
  const withAck = documents.map(({ notifications, ...d }) => ({
    ...d,
    myAcknowledgedAt: notifications[0]?.acknowledgedAt ?? null,
  }));

  return NextResponse.json(withAck);
}

// Publie un document — admin uniquement (gestion de l'école, pas une
// question financière). Le fichier lui-même est déjà envoyé à Vercel Blob
// par le navigateur avant cet appel (voir /api/documents/blob-upload et
// DocumentationView.tsx) — ce POST ne fait plus que créer la fiche.
const createSchema = z.object({
  title: z.string().min(1, "Le titre est requis."),
  category: z.string().optional().nullable(),
  visibility: z.enum(["ALL", "FI_ONLY"]).default("ALL"),
  fileName: z.string().min(1),
  blobUrl: z.string().url(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  // Vérifie que le fichier existe vraiment dans Blob et récupère taille/type
  // réels — jamais ceux annoncés par le client.
  let meta;
  try {
    meta = await head(parsed.data.blobUrl);
  } catch {
    return NextResponse.json(
      { error: "Fichier introuvable dans le stockage — réessaie l'envoi." },
      { status: 400 }
    );
  }

  const document = await prisma.schoolDocument.create({
    data: {
      title: parsed.data.title,
      category: parsed.data.category || null,
      visibility: parsed.data.visibility,
      fileName: parsed.data.fileName,
      fileMimeType: meta.contentType || "application/octet-stream",
      fileSize: meta.size,
      blobUrl: parsed.data.blobUrl,
      uploadedById: session.user.id,
    },
    select: safeSchoolDocumentSelect,
  });

  await notifyNewDocument(document);

  return NextResponse.json(document, { status: 201 });
}
