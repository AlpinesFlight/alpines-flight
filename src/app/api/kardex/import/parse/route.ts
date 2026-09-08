import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageSchool } from "@/lib/permissions";
import { parseKardexWorkbook } from "@/lib/kardex-import";

// 4 Mo : même plafond que les autres envois de fichiers (voir
// /api/aircraft/[id]/photo notamment) — limite réelle de la plateforme
// (Vercel, 4,5 Mo par requête), pas un choix arbitraire.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Étape 1/2 de l'import Kardex : ne fait QUE lire et structurer le fichier
// envoyé, aucune écriture en base ici. Le Gérant choisit ensuite, côté
// appli, quelles feuilles et quelles lignes utiliser avant de confirmer
// (voir POST /api/kardex/import/commit) — jamais d'écriture directe depuis
// un fichier externe sur des données de navigabilité sans relecture.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (4 Mo max)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let sheets;
  try {
    sheets = parseKardexWorkbook(buffer);
  } catch (err) {
    console.error("Lecture du fichier Kardex échouée :", err);
    return NextResponse.json(
      { error: "Impossible de lire ce fichier — vérifie que c'est bien un classeur Excel (.xls ou .xlsx)." },
      { status: 400 }
    );
  }

  if (sheets.length === 0) {
    return NextResponse.json(
      {
        error:
          "Aucune feuille reconnue (aucun nom d'onglet ne contient \"KARDEX\" ou \"STATUT\"). Vérifie le fichier.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ sheets });
}
