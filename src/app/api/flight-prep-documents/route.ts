import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeFlightPrepDocumentSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { head } from "@vercel/blob";
import { z } from "zod";

// Documents de référence pour la préparation de vol (masse et centrage,
// performances...) — page /gestion/preparation-vol, réservée au Gérant.
// ?category= filtre la liste ; sans filtre, tout est renvoyé (le volume
// attendu ici reste faible).
export async function GET(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const documents = await prisma.flightPrepDocument.findMany({
    where: category ? { category } : undefined,
    select: safeFlightPrepDocumentSelect,
    orderBy: [{ category: "asc" }, { uploadedAt: "desc" }],
  });
  return NextResponse.json(documents);
}

// Le fichier lui-même est déjà envoyé à Vercel Blob par le navigateur avant
// cet appel (voir /api/flight-prep-documents/blob-upload et
// GestionPrepVolView.tsx) — ce POST ne fait plus que créer la fiche.
const createSchema = z.object({
  title: z.string().min(1, "Le titre est requis."),
  category: z.string().optional().nullable(),
  fileName: z.string().min(1),
  blobUrl: z.string().url(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
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

  const document = await prisma.flightPrepDocument.create({
    data: {
      title: parsed.data.title,
      category: parsed.data.category || null,
      fileName: parsed.data.fileName,
      fileMimeType: meta.contentType || "application/octet-stream",
      fileSize: meta.size,
      blobUrl: parsed.data.blobUrl,
      uploadedById: session.user.id,
    },
    select: safeFlightPrepDocumentSelect,
  });

  return NextResponse.json(document, { status: 201 });
}
