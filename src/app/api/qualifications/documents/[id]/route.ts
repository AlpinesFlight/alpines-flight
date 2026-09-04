import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeDocumentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  number: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Corrige les infos d'un document déjà importé (n° de licence, dates,
// notes) — une erreur de saisie (date tapée à côté, numéro mal recopié...)
// n'exige pas de tout ré-importer. Volontairement PAS le statut ni le
// fichier lui-même : ça reste le rôle du circuit valider/rejeter (voir
// .../validate) et d'un nouveau renouvellement, pour ne pas court-circuiter
// cet historique. Admin/Gérant uniquement, quel que soit le statut du
// document (courant, archivé, rejeté...) — une correction peut concerner
// n'importe lequel.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const existing = await prisma.qualificationDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // "" traité comme null (champ vidé) — un input date/text vidé côté
  // client envoie souvent une chaîne vide plutôt que null explicitement.
  const normalizeDate = (v: string | null | undefined) =>
    v === undefined ? undefined : v ? new Date(v) : null;
  const normalizeText = (v: string | null | undefined) => (v === undefined ? undefined : v || null);

  const document = await prisma.qualificationDocument.update({
    where: { id },
    data: {
      number: normalizeText(parsed.data.number),
      issuedAt: normalizeDate(parsed.data.issuedAt),
      expiresAt: normalizeDate(parsed.data.expiresAt),
      notes: normalizeText(parsed.data.notes),
    },
    select: safeDocumentSelect,
  });
  return NextResponse.json(document);
}

// Retire un document importé par erreur. Autorisé pour l'admin, ou pour
// celui qui l'a importé tant qu'il n'a pas encore été validé/rejeté (une
// fois traité, seul l'admin peut le retirer, pour garder la trace).
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.qualificationDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isUploader = doc.uploadedById === session.user.id;
  const canDelete = canManageSchool(session.user.role) || (isUploader && doc.status === "PENDING");
  if (!canDelete) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Si c'était le document courant, détache le pointeur avant suppression.
  await prisma.qualification.updateMany({
    where: { currentDocumentId: id },
    data: { currentDocumentId: null },
  });
  await prisma.qualificationDocument.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
