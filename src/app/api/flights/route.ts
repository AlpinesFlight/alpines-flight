import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";

// Liste des vols (carnet) — alimente à la fois le sélecteur de vol du
// formulaire de séance (Formation → Nouvelle séance → Relier un vol, via
// ?unlinked=true) et la page Vols (résumé, filtrable par période via
// ?from=&to=, sur le champ date).
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedStudentId = searchParams.get("studentId");
  const unlinkedOnly = searchParams.get("unlinked") === "true";
  const studentId = session.user.role === "STUDENT" ? session.user.id : requestedStudentId;

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const dateFilter =
    from || to
      ? {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(new Date(to).getTime() + 86_399_999) } : {}), // fin de journée incluse
        }
      : undefined;

  const flights = await prisma.flightLog.findMany({
    where: {
      ...(studentId ? { studentId } : {}),
      ...(unlinkedOnly ? { trainingSession: { is: null } } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    include: {
      aircraft: true,
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
      stops: true,
      trainingProgram: { select: { id: true, code: true, title: true } },
    },
    orderBy: { date: "desc" },
    // Pas de plafond quand une période est demandée (résumé comptable/vols
    // complet) ; sinon, plafond raisonnable pour les usages "derniers vols".
    ...(dateFilter ? {} : { take: 100 }),
  });
  return NextResponse.json(flights);
}
