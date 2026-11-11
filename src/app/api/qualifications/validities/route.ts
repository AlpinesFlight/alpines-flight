import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { QualificationError, addValidities, validityInputSchema } from "@/lib/qualifications";
import { z } from "zod";

// Nouvelle validité (renouvellement, prorogation, qualification ajoutée)
// justifiée par des documents DÉJÀ au dossier de la personne — un nouveau
// fichier passe par POST .../documents. Le staff peut aussi enregistrer une
// date sans justificatif pour l'instant (affichée comme telle) ; un pilote
// doit toujours en joindre un.
const createSchema = z.object({
  userId: z.string().min(1),
  documentIds: z.array(z.string().min(1)).max(20).default([]),
  validities: z.array(validityInputSchema).min(1, "Indique au moins une qualification."),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { userId, documentIds, validities } = parsed.data;
  const staff = canManageSchool(session.user.role);
  if (!staff && userId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!staff && documentIds.length === 0) {
    return NextResponse.json({ error: "Joins le document qui justifie cette qualification." }, { status: 400 });
  }

  const owned = await prisma.pilotDocument.count({ where: { id: { in: documentIds }, userId } });
  if (owned !== new Set(documentIds).size) {
    return NextResponse.json({ error: "Document introuvable dans ce dossier." }, { status: 400 });
  }

  try {
    const ids = await prisma.$transaction((db) =>
      addValidities(db, { userId, inputs: validities, documentIds, actorId: session.user.id, validated: staff })
    );
    return NextResponse.json({ ids }, { status: 201 });
  } catch (err) {
    if (err instanceof QualificationError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
