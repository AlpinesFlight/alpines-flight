import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { canManageFinance, canManageSchool, isInstructorOrAbove, isGerant } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const isSelf = session.user.id === id;

  // Profil + historique de vols : accessible au staff pédagogique (FI et
  // au-dessus) ou à l'élève/pilote lui-même — jamais à un autre élève, même
  // en devinant son id.
  if (!isInstructorOrAbove(session.user.role) && !isSelf) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Solde et mouvements financiers : réservés au Gérant ou à l'élève/pilote
  // lui-même — un Admin ou un FI voit le dossier pédagogique mais pas les
  // finances (voir src/lib/permissions.ts). Sans ça, un Admin pourrait
  // contourner le cloisonnement déjà posé sur /api/transactions simplement
  // en passant par cette route-ci.
  const canSeeFinance = canManageFinance(session.user.role) || isSelf;

  const student = await prisma.user.findUnique({
    where: { id },
    select: {
      ...safeUserSelect,
      studentProfile: canSeeFinance
        ? true
        : {
            select: {
              id: true,
              userId: true,
              licenseType: true,
              totalHours: true,
              isPilot: true,
              canGiveBaptism: true,
              soloGrassCleared: true,
              soloPavedCleared: true,
              createdAt: true,
              updatedAt: true,
            },
          },
      reservationsAsStudent: {
        include: { aircraft: { select: safeAircraftSelect }, instructor: { select: safeUserSelect } },
        orderBy: { startTime: "desc" },
        take: 20,
      },
      flightsAsStudent: {
        include: { aircraft: { select: safeAircraftSelect }, instructor: { select: safeUserSelect } },
        orderBy: { date: "desc" },
        take: 20,
      },
      transactions: canSeeFinance
        ? {
            include: { flightLog: { include: { aircraft: { select: safeAircraftSelect } } } },
            orderBy: { createdAt: "desc" },
            take: 30,
          }
        : false,
      // Tarifs avion personnalisés — jamais visible d'un autre compte que
      // le Gérant, même pas le pilote concerné (voir PilotAircraftRate).
      pilotAircraftRates: isGerant(session.user.role)
        ? { include: { aircraft: { select: safeAircraftSelect } } }
        : false,
    },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(student);
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Le solde n'est jamais modifié ici : il ne peut évoluer que via le grand
  // livre (versements confirmés, débits de vol, écritures d'ajustement) —
  // voir /api/transactions.
  const { firstName, lastName, phone, licenseType, licenseNumber, medicalExpiry, notes, isPilot, canGiveBaptism } = body;

  if (typeof isPilot !== "undefined" && typeof isPilot !== "boolean") {
    return NextResponse.json({ error: "isPilot doit être un booléen." }, { status: 400 });
  }
  if (typeof canGiveBaptism !== "undefined") {
    if (typeof canGiveBaptism !== "boolean") {
      return NextResponse.json({ error: "canGiveBaptism doit être un booléen." }, { status: 400 });
    }
    // Autorisation "vol baptême" : contrairement au reste de ce PATCH
    // (ouvert à canManageSchool, donc Admin compris), seul le Gérant peut
    // la donner ou la retirer — elle dispense de débit sur le compte
    // pilote, donc une question financière au même titre que le reste de
    // ce qui est réservé au Gérant (voir src/lib/permissions.ts).
    if (!isGerant(session.user.role)) {
      return NextResponse.json(
        { error: "Seul le Gérant peut donner ou retirer l'autorisation vol baptême." },
        { status: 401 }
      );
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      firstName,
      lastName,
      phone,
      studentProfile: {
        update: {
          licenseType,
          licenseNumber,
          medicalExpiry: medicalExpiry ? new Date(medicalExpiry) : undefined,
          notes,
          isPilot,
          canGiveBaptism,
        },
      },
    },
    select: { ...safeUserSelect, studentProfile: true },
  });
  return NextResponse.json(user);
}

// Suppression totale (pas une anonymisation) — réservée au Gérant, et
// refusée si le compte a le moindre historique (vols, réservations,
// mouvements financiers, séances de formation...) que l'école doit
// légalement conserver (comptabilité 10 ans, dossiers DTO 3 ans — voir la
// politique de confidentialité). Dans ce cas, POST /api/users/[id]/anonymize
// reste la seule voie. Utile pour un compte créé par erreur, jamais utilisé.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Tu ne peux pas supprimer ton propre compte." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.role !== "STUDENT") {
    return NextResponse.json({ error: "Ce compte n'est pas un compte élève." }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Violation de clé étrangère : au moins une table référence encore ce
    // compte (vol, réservation, mouvement financier, séance de formation...)
    // — la base refuse à raison, cet historique doit être conservé. Testé
    // en conditions réelles : Postgres/Prisma ne renvoie pas toujours le
    // code "connu" P2003 pour ce cas précis (RESTRICT), d'où la détection
    // par message en complément — ne jamais se fier au seul code P2003 ici.
    const message = err instanceof Error ? err.message : String(err);
    const isForeignKeyViolation =
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") ||
      /foreign key constraint/i.test(message);

    if (isForeignKeyViolation) {
      return NextResponse.json(
        {
          error:
            "Impossible : ce compte a un historique (vols, réservations, mouvements financiers ou formation) que l'école doit légalement conserver. Utilise plutôt l'anonymisation.",
        },
        { status: 409 }
      );
    }

    console.error("DELETE /api/students/[id] a échoué :", err);
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 500 });
  }
}
