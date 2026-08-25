import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importTrainingPrograms } from "@/lib/import-training-programs";
import { canManageSchool } from "@/lib/permissions";

// Importe/synchronise les programmes de formation depuis le dossier source
// (fichiers JSON du responsable pédagogique). Ré-exécutable sans risque :
// les phases/exercices existants sont mis à jour en place, jamais recréés,
// donc la progression déjà saisie des élèves n'est jamais perdue.
export async function POST() {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const report = await importTrainingPrograms();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
