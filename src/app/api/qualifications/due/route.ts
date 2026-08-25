import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findDueQualifications } from "@/lib/qualifications";
import { canManageSchool } from "@/lib/permissions";

// Liste des qualifications/licences/médicales qui entrent (ou sont déjà)
// dans leur fenêtre de rappel — alimente le tableau de bord "relances".
export async function GET() {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const due = await findDueQualifications();
  return NextResponse.json(due);
}
