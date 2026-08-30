import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";

// Liste des vols (carnet) — alimente à la fois le sélecteur de vol du
// formulaire de séance (Formation → Nouvelle séance → Relier un vol, via
// ?unlinked=true) et la page Vols (résumé, filtrable par période via
// ?from=&to=, sur le champ date).
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unlinkedOnly = searchParams.get("unlinked") === "true";
  // Seul le Gérant voit le carnet de vol complet de l'école — tout autre
  // compte (y compris Admin et FI) ne voit que les vols où il apparaît,
  // comme élève ou comme instructeur.
  const ownFlightsOnly = !isGerant(session.user.role);

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
      ...(ownFlightsOnly
        ? { OR: [{ studentId: session.user.id }, { instructorId: session.user.id }] }
        : {}),
      ...(unlinkedOnly ? { trainingSession: { is: null } } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    include: {
      // aircraft: true (avant) incluait aussi photoData — la photo complète
      // de l'avion (jusqu'à 8 Mo, voir /api/aircraft/[id]/photo), répétée à
      // chaque vol. Sur une période large, ça faisait grimper la réponse à
      // plusieurs dizaines de Mo pour une poignée de vols. Le binaire ne
      // doit transiter que par la route de streaming dédiée.
      aircraft: { select: safeAircraftSelect },
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
