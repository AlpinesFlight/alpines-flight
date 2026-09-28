import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeDocumentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { head } from "@vercel/blob";
import { z } from "zod";

// Le fichier lui-même est déjà envoyé à Vercel Blob par le navigateur avant
// cet appel (voir .../blob-upload et LicencesView.tsx) — ce POST ne fait
// plus que créer la fiche (et, au besoin, la qualification elle-même).
const createSchema = z.object({
  userId: z.string().min(1),
  qualificationId: z.string().optional().nullable(),
  type: z.string().optional(),
  label: z.string().optional(),
  reminderDaysBefore: z.number().int().optional(),
  number: z.string().optional().nullable(),
  issuedAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  fileName: z.string().min(1),
  blobUrl: z.string().url(),
});

// Importe un nouveau document (renouvellement) pour une qualification —
// existante (qualificationId fourni) ou nouvelle (type + label fournis).
// Reste PENDING tant que l'admin ne l'a pas validé : voir
// /api/qualifications/documents/[id]/validate.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { userId, qualificationId, type, label, reminderDaysBefore, number, issuedAt, expiresAt, notes } =
    parsed.data;

  if (!canManageSchool(session.user.role) && userId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let qualification;
  if (qualificationId) {
    qualification = await prisma.qualification.findUnique({ where: { id: qualificationId } });
    if (!qualification || qualification.userId !== userId) {
      return NextResponse.json({ error: "Qualification introuvable." }, { status: 404 });
    }
  } else {
    if (!type || !label) {
      return NextResponse.json(
        { error: "type et label sont requis pour créer une nouvelle qualification." },
        { status: 400 }
      );
    }
    qualification = await prisma.qualification.create({
      data: { userId, type: type as never, label, reminderDaysBefore: reminderDaysBefore ?? 45 },
    });
  }

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

  const document = await prisma.qualificationDocument.create({
    data: {
      qualificationId: qualification.id,
      number: number || null,
      issuedAt: issuedAt ? new Date(issuedAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes: notes || null,
      fileName: parsed.data.fileName,
      fileMimeType: meta.contentType || "application/octet-stream",
      fileSize: meta.size,
      blobUrl: parsed.data.blobUrl,
      status: "PENDING",
      uploadedById: session.user.id,
    },
    select: safeDocumentSelect,
  });

  return NextResponse.json(document, { status: 201 });
}
