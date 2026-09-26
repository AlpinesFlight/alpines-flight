import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { canManageFinance } from "@/lib/permissions";
import { operationDateSchema } from "@/lib/transactions";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // Mouvements financiers = donnée sensible : seul le Gérant voit tous les
  // comptes (ou filtre via ?studentId=...) — même l'Admin n'y a pas accès.
  // Un élève/pilote, un instructeur ou un admin ne voit que son propre
  // compte, quel que soit le ?studentId= demandé (le détail d'UN élève
  // reste consultable par le staff via GET /api/students/[id]).
  const requestedStudentId = searchParams.get("studentId");
  const studentId = canManageFinance(session.user.role) ? requestedStudentId : session.user.id;

  const transactions = await prisma.accountTransaction.findMany({
    where: studentId ? { studentId } : undefined,
    include: {
      student: { select: safeUserSelect },
      confirmedBy: { select: safeUserSelect },
      flightLog: { include: { aircraft: { select: safeAircraftSelect } } },
    },
    // Classés par date de l'opération (vol, virement...), pas par date de
    // saisie — voir AccountTransaction.date.
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(transactions);
}

// Déclaration d'un versement par le pilote (ou pour son compte par l'admin) :
// reste PENDING tant que l'admin n'a pas vérifié la réception sur son relevé.
const depositSchema = z.object({
  type: z.literal("DEPOSIT"),
  studentId: z.string(),
  amountCents: z.number().int().positive(),
  method: z.enum(["CARD", "TRANSFER", "CASH", "CHECK"]).default("TRANSFER"),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Date du virement (par défaut : aujourd'hui).
  date: operationDateSchema.optional(),
});

// Écriture manuelle admin (avoir, correction...) : appliquée immédiatement.
const adjustmentSchema = z.object({
  type: z.literal("ADJUSTMENT"),
  studentId: z.string(),
  amountCents: z.number().int(), // peut être négatif
  notes: z.string().min(1),
  date: operationDateSchema.optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.type === "DEPOSIT") {
    const parsed = depositSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

    // Seul le Gérant peut déclarer un versement pour quelqu'un d'autre (ex.
    // espèces reçues en personne) — tout autre compte ne peut déclarer que
    // sur son propre compte pilote.
    if (!canManageFinance(session.user.role) && parsed.data.studentId !== session.user.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { date, ...deposit } = parsed.data;
    const tx = await prisma.accountTransaction.create({
      data: { ...deposit, ...(date ? { date: new Date(date) } : {}), status: "PENDING" },
      include: { student: { select: safeUserSelect } },
    });
    return NextResponse.json(tx, { status: 201 });
  }

  if (body.type === "ADJUSTMENT") {
    if (!canManageFinance(session.user.role))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const parsed = adjustmentSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

    const { date: adjustmentDate, ...adjustment } = parsed.data;
    const tx = await prisma.$transaction(async (db) => {
      const created = await db.accountTransaction.create({
        data: {
          ...adjustment,
          ...(adjustmentDate ? { date: new Date(adjustmentDate) } : {}),
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedById: session.user.id,
        },
        include: { student: { select: safeUserSelect } },
      });
      // upsert : le compte peut être celui d'un instructeur qui n'a encore
      // jamais volé comme pilote débité (pas de StudentProfile existant),
      // ex. le Gérant crédite son compte par anticipation.
      await db.studentProfile.upsert({
        where: { userId: parsed.data.studentId },
        create: { userId: parsed.data.studentId, balanceCents: parsed.data.amountCents },
        update: { balanceCents: { increment: parsed.data.amountCents } },
      });
      return created;
    });

    return NextResponse.json(tx, { status: 201 });
  }

  return NextResponse.json({ error: "type invalide" }, { status: 400 });
}
