import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { DOCUMENT_CATEGORIES } from "@/lib/qualification-catalog";
import { QualificationError, addValidities, validityInputSchema } from "@/lib/qualifications";
import { head } from "@vercel/blob";
import { z } from "zod";

// Le fichier lui-même est déjà envoyé à Vercel Blob par le navigateur avant
// cet appel (voir .../blob-upload et LicencesView.tsx) — ce POST crée le
// justificatif et, dans la même transaction, chaque qualification qu'il
// justifie (une licence peut porter à elle seule SEP, FI, anglais...).
const createSchema = z.object({
  userId: z.string().min(1),
  category: z.enum(DOCUMENT_CATEGORIES.map((c) => c.key) as [string, ...string[]]),
  title: z.string().trim().max(120).optional().nullable(),
  fileName: z.string().min(1),
  blobUrl: z.string().url(),
  validities: z.array(validityInputSchema).min(1, "Indique au moins une qualification justifiée par ce document."),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { userId, category, title, fileName, blobUrl, validities } = parsed.data;
  const staff = canManageSchool(session.user.role);
  if (!staff && userId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Vérifie que le fichier existe vraiment dans Blob et récupère taille/type
  // réels — jamais ceux annoncés par le client.
  let meta;
  try {
    meta = await head(blobUrl);
  } catch {
    return NextResponse.json(
      { error: "Fichier introuvable dans le stockage — réessaie l'envoi." },
      { status: 400 }
    );
  }

  try {
    const document = await prisma.$transaction(async (db) => {
      const doc = await db.pilotDocument.create({
        data: {
          userId,
          category,
          title: title || null,
          fileName,
          fileMimeType: meta.contentType || "application/octet-stream",
          fileSize: meta.size,
          blobUrl,
          uploadedById: session.user.id,
        },
        select: { id: true },
      });
      // Saisie du staff : prise en compte tout de suite. Déclarée par le
      // pilote lui-même : en attente de validation.
      await addValidities(db, {
        userId,
        inputs: validities,
        documentIds: [doc.id],
        actorId: session.user.id,
        validated: staff,
      });
      return doc;
    });
    return NextResponse.json(document, { status: 201 });
  } catch (err) {
    if (err instanceof QualificationError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
