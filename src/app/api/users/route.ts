import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";

// Trombinoscope complet, tous rôles confondus — sert à la page de gestion
// des droits d'accès (Gérant uniquement). Pour les rosters par rôle
// (élèves, instructeurs), voir /api/students et /api/instructors.
export async function GET() {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    select: {
      ...safeUserSelect,
      studentProfile: { select: { id: true } },
      instructorProfile: { select: { id: true } },
    },
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
  });
  return NextResponse.json(users);
}
