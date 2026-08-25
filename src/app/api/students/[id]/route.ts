import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageFinance, canManageSchool, isInstructorOrAbove } from "@/lib/permissions";

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
              createdAt: true,
              updatedAt: true,
            },
          },
      reservationsAsStudent: {
        include: { aircraft: true, instructor: { select: safeUserSelect } },
        orderBy: { startTime: "desc" },
        take: 20,
      },
      flightsAsStudent: {
        include: { aircraft: true, instructor: { select: safeUserSelect } },
        orderBy: { date: "desc" },
        take: 20,
      },
      transactions: canSeeFinance
        ? {
            include: { flightLog: { include: { aircraft: true } } },
            orderBy: { createdAt: "desc" },
            take: 30,
          }
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
  const { firstName, lastName, phone, licenseType, licenseNumber, medicalExpiry, notes, isPilot } = body;

  if (typeof isPilot !== "undefined" && typeof isPilot !== "boolean") {
    return NextResponse.json({ error: "isPilot doit être un booléen." }, { status: 400 });
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
        },
      },
    },
    select: { ...safeUserSelect, studentProfile: true },
  });
  return NextResponse.json(user);
}
