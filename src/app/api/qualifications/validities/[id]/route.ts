import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { settleAfterRemoval } from "@/lib/qualifications";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    variant: z.string().trim().nullable().optional(),
    number: z.string().trim().nullable().optional(),
    issuedAt: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    // Remplace l'ensemble des justificatifs reliés (documents du même dossier).
    documentIds: z.array(z.string().min(1)).max(20).optional(),
  })
  .refine((v) => !v.issuedAt || !v.expiresAt || v.expiresAt >= v.issuedAt, {
    message: "La fin de validité ne peut pas précéder la date de délivrance.",
  });

// Corrige une validité (n°, dates, variante, justificatifs) sans tout
// ressaisir — une date tapée à côté ne doit pas obliger à ré-importer.
// Gérant/Admin uniquement, quel que soit son statut. Ne change jamais le
// statut : c'est le rôle de .../validate.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const existing = await prisma.qualificationValidity.findUnique({
    where: { id },
    include: { qualification: { select: { userId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { documentIds } = parsed.data;
  if (documentIds) {
    const owned = await prisma.pilotDocument.count({
      where: { id: { in: documentIds }, userId: existing.qualification.userId },
    });
    if (owned !== new Set(documentIds).size) {
      return NextResponse.json({ error: "Document introuvable dans ce dossier." }, { status: 400 });
    }
  }

  // "" traité comme null (champ vidé) — un input vidé côté client envoie
  // souvent une chaîne vide plutôt que null.
  const date = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);
  const text = (v: string | null | undefined) => (v === undefined ? undefined : v || null);

  await prisma.qualificationValidity.update({
    where: { id },
    data: {
      variant: text(parsed.data.variant),
      number: text(parsed.data.number),
      issuedAt: date(parsed.data.issuedAt),
      expiresAt: date(parsed.data.expiresAt),
      notes: text(parsed.data.notes),
      ...(documentIds ? { documents: { set: documentIds.map((docId) => ({ id: docId })) } } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

// Retire une validité saisie par erreur. Staff : toujours ; la personne qui
// l'a déclarée : tant qu'elle attend la validation. Si c'était la validité
// courante, la précédente reprend sa place.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const validity = await prisma.qualificationValidity.findUnique({ where: { id } });
  if (!validity) return NextResponse.json({ error: "not found" }, { status: 404 });

  const canDelete =
    canManageSchool(session.user.role) ||
    (validity.uploadedById === session.user.id && validity.status === "PENDING");
  if (!canDelete) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.$transaction(async (db) => {
    await db.qualification.updateMany({ where: { currentValidityId: id }, data: { currentValidityId: null } });
    await db.qualificationValidity.delete({ where: { id } });
    await settleAfterRemoval(db, validity.qualificationId);
  });
  return NextResponse.json({ ok: true });
}
