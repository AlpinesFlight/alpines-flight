import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isInstructorOrAbove } from "@/lib/permissions";
import { loadLicencesData } from "@/lib/qualifications";

// Rubrique Licences : un élève/pilote ne voit que son propre dossier ; le
// staff pédagogique (FI et au-dessus) voit tout le monde, utile pour
// vérifier une licence ou un médical avant un vol. La création passe par
// .../documents (nouveau justificatif) et .../validities (justificatifs
// déjà au dossier).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await loadLicencesData(
    isInstructorOrAbove(session.user.role) ? {} : { onlyUserId: session.user.id }
  );
  return NextResponse.json(data);
}
