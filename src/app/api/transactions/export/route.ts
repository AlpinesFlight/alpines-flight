import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { ISO_DAY, buildPilotAccountsExport, parisToday } from "@/lib/pilot-accounts-export";

// Export Excel pour la comptable (bilan) : heures de vol prépayées vendues et
// consommées par client, sur une période — Gérant uniquement (finances de
// toute l'école, voir src/lib/permissions.ts). Voir
// src/lib/pilot-accounts-export.ts pour le contenu du fichier.
export async function GET(req: Request) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const today = parisToday();
  const from = searchParams.get("from") || `${today.slice(0, 4)}-01-01`;
  let to = searchParams.get("to") || today;
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) {
    return NextResponse.json({ error: "Dates invalides (format attendu AAAA-MM-JJ)." }, { status: 400 });
  }
  // Un solde « au 31/12 » calculé aujourd'hui serait faux : la période
  // s'arrête au plus tard aujourd'hui.
  if (to > today) to = today;
  if (from > to) {
    return NextResponse.json({ error: "La date de début doit précéder la date de fin." }, { status: 400 });
  }

  const { buffer, filename } = await buildPilotAccountsExport(from, to);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
