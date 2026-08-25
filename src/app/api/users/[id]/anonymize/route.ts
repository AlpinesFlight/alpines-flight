import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
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

  const user = await prisma.$transaction(async (db) => {
    if (existing.studentProfile) {
      await db.studentProfile.update({
        where: { userId: id },
        data: { licenseNumber: null, medicalExpiry: null, notes: null },
      });
    }

    // Scans de licence/médicale : aucune obligation de conservation propre
    // à ces documents une fois la personne anonymisée — supprimés avec leur
    // créneau de qualification (détache d'abord le pointeur document
    // courant pour éviter le conflit de clé étrangère, même logique que
    // DELETE /api/qualifications/[id]).
    await db.qualification.updateMany({ where: { userId: id }, data: { currentDocumentId: null } });
    await db.qualification.deleteMany({ where: { userId: id } });

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

  return NextResponse.json(user);
}
