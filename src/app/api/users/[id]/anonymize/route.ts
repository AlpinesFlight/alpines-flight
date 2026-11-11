import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { del } from "@vercel/blob";
import crypto from "crypto";

type Params = { params: Promise<{ id: string }> };

// Droit à l'effacement (RGPD art. 17) — réservé au Gérant. N'efface pas
// purement et simplement le compte : la comptabilité (AccountTransaction,
// FlightLog) et l'historique de formation DTO doivent être conservés
// plusieurs années (obligations légales — Code de commerce, traçabilité
// DSAC), ce qui prime sur le droit à l'effacement (RGPD art. 17§3.b).
// À la place, on anonymise l'identité : nom, email, téléphone remplacés par
// des valeurs neutres, mot de passe invalidé (connexion impossible), et les
// données personnelles annexes (n° de licence, échéance médicale, notes,
// scans de qualification) supprimées — elles n'ont plus d'utilité une fois
// la personne anonymisée. Le solde et les heures de vol restent inchangés
// (nécessaires à la cohérence comptable), simplement rattachés à un compte
// désormais anonyme.
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json(
      { error: "Tu ne peux pas anonymiser ton propre compte." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, studentProfile: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Mot de passe aléatoire et jamais communiqué : la connexion devient
  // définitivement impossible pour ce compte.
  const unusablePasswordHash = crypto.randomBytes(32).toString("hex");

  // Fichiers à effacer du stockage une fois les fiches supprimées : les
  // justificatifs, et les anciennes validités qui portaient encore leur
  // propre fichier (voir la migration licences_justificatifs).
  const [documentBlobs, legacyBlobs] = await Promise.all([
    prisma.pilotDocument.findMany({ where: { userId: id, blobUrl: { not: null } }, select: { blobUrl: true } }),
    prisma.qualificationValidity.findMany({
      where: { qualification: { userId: id }, blobUrl: { not: null } },
      select: { blobUrl: true },
    }),
  ]);
  const blobUrls = [...new Set([...documentBlobs, ...legacyBlobs].map((b) => b.blobUrl!))];

  const user = await prisma.$transaction(async (db) => {
    if (existing.studentProfile) {
      await db.studentProfile.update({
        where: { userId: id },
        data: { licenseNumber: null, medicalExpiry: null, notes: null },
      });
    }

    // Scans de licence/médicale : aucune obligation de conservation propre
    // à ces documents une fois la personne anonymisée — supprimés avec les
    // qualifications (détache d'abord le pointeur validité courante pour
    // éviter le conflit de clé étrangère, même logique que DELETE
    // /api/qualifications/[id]), fichiers compris (plus bas, hors
    // transaction).
    await db.qualification.updateMany({ where: { userId: id }, data: { currentValidityId: null } });
    await db.qualification.deleteMany({ where: { userId: id } });
    await db.pilotDocument.deleteMany({ where: { userId: id } });

    return db.user.update({
      where: { id },
      data: {
        firstName: "Compte",
        lastName: "anonymisé",
        email: `anon-${id}@deleted.local`,
        phone: null,
        passwordHash: unusablePasswordHash,
      },
      select: safeUserSelect,
    });
  });

  for (const url of blobUrls) {
    try {
      await del(url);
    } catch (err) {
      console.error(`Suppression d'un justificatif (anonymisation de ${id}) échouée :`, err);
    }
  }

  return NextResponse.json(user);
}
