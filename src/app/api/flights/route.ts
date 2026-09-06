import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { isGerant, canManageFinance } from "@/lib/permissions";
import { recalcAircraftMaintenanceStatuses } from "@/lib/maintenance";
import { effectiveAircraftRateCents } from "@/lib/reservations";
import { durationHours, formatHoursMinutes } from "@/lib/format";
import { z } from "zod";

// Liste des vols (carnet) — alimente à la fois le sélecteur de vol du
// formulaire de séance (Formation → Nouvelle séance → Relier un vol, via
// ?studentId=&unlinked=true — restreint aux vols de CET élève, pas tout le
// carnet de l'école) et la page Vols (résumé, filtrable par période via
// ?from=&to=, sur le champ date).
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unlinkedOnly = searchParams.get("unlinked") === "true";
  const studentId = searchParams.get("studentId");
  // Seul le Gérant voit le carnet de vol complet de l'école — tout autre
  // compte (y compris Admin et FI) ne voit que les vols où il apparaît,
  // comme élève ou comme instructeur. ?studentId ci-dessous ne remplace pas
  // cette restriction, il s'y ajoute (voir plus bas).
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
      // Ajouté (pas substitué) à la restriction ci-dessus : pour le Gérant,
      // ça restreint au seul élève demandé (sinon tout le carnet de l'école
      // apparaissait dans le sélecteur "Relier un vol" d'une séance) ; pour
      // un FI/Admin, ça restreint en plus à ses propres vols avec cet élève.
      ...(studentId ? { studentId } : {}),
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

const createSchema = z
  .object({
    aircraftId: z.string().min(1, "Avion requis."),
    studentId: z.string().nullable().optional(),
    instructorId: z.string().nullable().optional(),
    // Ne détermine que le calcul du coût d'instruction ci-dessous (voir
    // isInstructionFlight) — jamais persisté sur FlightLog, qui n'a pas de
    // champ type (voir /api/reservations/[id]/complete, même logique).
    type: z.enum(["INSTRUCTION", "SOLO", "LOCATION", "MAINTENANCE"]),
    trainingProgramId: z.string().nullable().optional(),
    departureTime: z.string(),
    arrivalTime: z.string(),
    departureAirfield: z.string().min(1, "Terrain de départ requis."),
    arrivalAirfield: z.string().min(1, "Terrain de destination requis."),
    remarks: z.string().nullable().optional(),
    // Pas de .min(1) ici, volontairement — contrairement à
    // /api/reservations/[id]/complete : ce tableau ne sert qu'aux touchés
    // intermédiaires (tours de piste...), pas à l'atterrissage final (déjà
    // compté via le +1 plus bas), donc un vol simple d'un point A à B n'a
    // légitimement rien à y mettre.
    stops: z.array(
      z.object({
        airfield: z.string().min(1),
        touchAndGo: z.number().int().positive(),
      })
    ),
    fuelRefillDone: z.boolean().optional().default(false),
    fuelCard: z.enum(["BP", "TOTAL", "BADGE_TALLARD"]).optional().nullable(),
    fuelLiters: z.number().positive().optional().nullable(),
    fuelType: z.enum(["AVGAS_100LL", "SP98"]).optional().nullable(),
    fuelAirfield: z.string().optional().nullable(),
  })
  .refine(
    (d) => !d.fuelRefillDone || (d.fuelCard && d.fuelLiters && d.fuelType && d.fuelAirfield),
    {
      message:
        "Si le plein a été fait, la carte, le nombre de litres, le type de carburant et le terrain sont requis.",
      path: ["fuelRefillDone"],
    }
  );

// Saisie directe d'un vol antérieur (rattrapage carnet de vol/comptabilité —
// ex. vol réalisé avant la mise en place de l'appli, ou oublié), sans passer
// par une Reservation : donc sans créneau sur le planning et surtout sans le
// mail envoyé à la création/modification d'une réservation (voir
// notifyReservation). Reprend exactement la même logique de calcul et de
// débit que la clôture normale d'un vol réservé
// (POST /api/reservations/[id]/complete) — seule différence, tout ce qu'une
// Reservation aurait fourni (avion, pilote, type...) est saisi ici
// directement. Gérant uniquement, comme le reste de ce qui touche
// directement le solde des comptes pilotes (voir /api/flights/[id]).
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const {
    aircraftId,
    studentId,
    instructorId,
    type,
    trainingProgramId,
    departureTime,
    arrivalTime,
    departureAirfield,
    arrivalAirfield,
    remarks,
    stops,
    fuelRefillDone,
    fuelCard,
    fuelLiters,
    fuelType,
    fuelAirfield,
  } = parsed.data;

  const start = new Date(departureTime);
  const end = new Date(arrivalTime);
  const duration = durationHours(start, end);
  if (duration <= 0) {
    return NextResponse.json(
      { error: "L'heure d'arrivée doit être après l'heure de départ." },
      { status: 400 }
    );
  }

  const aircraft = await prisma.aircraft.findUnique({ where: { id: aircraftId } });
  if (!aircraft) return NextResponse.json({ error: "Avion introuvable." }, { status: 404 });

  // +1 : l'atterrissage à destination compte par défaut, en plus des
  // touchés éventuels aux terrains intermédiaires (stops) — même règle qu'à
  // la clôture normale.
  const totalLandings = stops.reduce((sum, s) => sum + s.touchAndGo, 0) + 1;

  // Tarif avion : dérogation Gérant (PilotAircraftRate) si elle existe pour
  // ce pilote sur cet avion précis, sinon le tarif standard de l'avion.
  const effectiveRateCents = await effectiveAircraftRateCents(
    studentId ?? null,
    aircraftId,
    aircraft.hourlyRateCents
  );
  const aircraftCostCents = Math.round(duration * effectiveRateCents);

  // Tarif d'instruction : même logique qu'à la clôture normale — priorité
  // au tarif de la formation visée, sinon tarif horaire par défaut de
  // l'instructeur. Un vol Solo/Location avec un instructeur simplement
  // rattaché (supervision) ne facture pas d'instruction, comme sur le
  // planning.
  let instructionCostCents = 0;
  const isInstructionFlight = type === "INSTRUCTION" && !!instructorId;
  if (isInstructionFlight && instructorId) {
    let rateCents: number | null = null;
    if (trainingProgramId) {
      const program = await prisma.trainingProgram.findUnique({
        where: { id: trainingProgramId },
        select: { instructionRateCents: true },
      });
      rateCents = program?.instructionRateCents ?? null;
    }
    if (!rateCents) {
      const instructorProfile = await prisma.instructorProfile.findUnique({
        where: { userId: instructorId },
      });
      rateCents = instructorProfile?.hourlyRateCents ?? null;
    }
    if (rateCents) {
      instructionCostCents = Math.round(duration * rateCents);
    }
  }
  const amountCents = aircraftCostCents + instructionCostCents;

  const result = await prisma.$transaction(async (db) => {
    const flight = await db.flightLog.create({
      data: {
        aircraftId,
        studentId: studentId || null,
        // L'instructeur reste enregistré même hors vol d'instruction (ex.
        // supervision d'un Solo) — seul le coût d'instruction et la
        // formation facturée dépendent d'isInstructionFlight.
        instructorId: instructorId || null,
        trainingProgramId: isInstructionFlight ? trainingProgramId || null : null,
        date: start,
        departureTime: start,
        arrivalTime: end,
        departureAirfield: departureAirfield.trim().toUpperCase(),
        arrivalAirfield: arrivalAirfield.trim().toUpperCase(),
        duration,
        totalLandings,
        aircraftCostCents,
        instructionCostCents,
        remarks,
        stops: { create: stops },
        fuelRefillDone,
        fuelCard: fuelRefillDone ? fuelCard : null,
        fuelLiters: fuelRefillDone ? fuelLiters : null,
        fuelType: fuelRefillDone ? fuelType : null,
        fuelAirfield: fuelRefillDone ? fuelAirfield : null,
      },
      include: {
        stops: true,
        aircraft: { select: safeAircraftSelect },
        student: { select: safeUserSelect },
        instructor: { select: safeUserSelect },
        trainingProgram: { select: { id: true, code: true, title: true, instructionRateCents: true } },
      },
    });

    if (studentId) {
      // Même format que la clôture normale (voir
      // /api/reservations/[id]/complete) — un vol saisi ici doit être
      // indiscernable d'un vol clôturé normalement dans l'historique du
      // compte pilote.
      const notesParts = [`Avion ${aircraft.registration} — ${formatHoursMinutes(duration)}`];
      if (instructionCostCents > 0) notesParts.push(`Instruction — ${formatHoursMinutes(duration)}`);

      await db.accountTransaction.create({
        data: {
          studentId,
          type: "FLIGHT_DEBIT",
          status: "CONFIRMED",
          amountCents: -amountCents,
          flightLogId: flight.id,
          notes: notesParts.join(" + "),
          confirmedAt: new Date(),
          confirmedById: session.user.id,
        },
      });

      await db.studentProfile.update({
        where: { userId: studentId },
        data: {
          totalHours: { increment: duration },
          balanceCents: { decrement: amountCents },
        },
      });
    }

    await db.aircraft.update({
      where: { id: aircraftId },
      data: {
        totalHours: { increment: duration },
        totalCycles: { increment: totalLandings },
      },
    });

    await recalcAircraftMaintenanceStatuses(db, aircraftId);

    return flight;
  });

  return NextResponse.json(result, { status: 201 });
}
