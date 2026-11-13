import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  safeUserSelect,
  safeAircraftSelect,
  safeTransactionAttachmentSelect,
  landingFlightSelect,
} from "@/lib/selects";
import { canManageFinance } from "@/lib/permissions";
import { operationDateSchema } from "@/lib/transactions";
import { verifyTransactionAttachment } from "@/lib/transaction-attachment-blob";

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
      landingFlightLog: { select: landingFlightSelect },
      attachment: { select: safeTransactionAttachmentSelect },
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

// Taxe d'atterrissage payée par l'école sur un autre terrain, refacturée au
// pilote par le Gérant : débitée immédiatement, avec la facture de
// l'aéroport en justificatif (facultatif) que le pilote peut ouvrir.
const landingFeeSchema = z.object({
  type: z.literal("LANDING_FEE"),
  studentId: z.string().min(1, "Pilote requis."),
  // Montant de la taxe, en positif : c'est un débit.
  amountCents: z.number().int().positive("Le montant doit être supérieur à 0."),
  airfield: z
    .string()
    .trim()
    .min(1, "Terrain requis.")
    .max(60)
    .transform((s) => s.toUpperCase()),
  // Date de l'atterrissage (par défaut : aujourd'hui).
  date: operationDateSchema.optional(),
  landingFlightLogId: z.string().min(1).nullable().optional(),
  // N° de la facture de l'aéroport.
  reference: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  attachment: z.object({ fileName: z.string().min(1), blobUrl: z.string().url() }).nullable().optional(),
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

  if (body.type === "LANDING_FEE") {
    if (!canManageFinance(session.user.role))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const parsed = landingFeeSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
    const fee = parsed.data;

    const [pilot, flight] = await Promise.all([
      prisma.user.findUnique({ where: { id: fee.studentId }, select: { id: true } }),
      fee.landingFlightLogId
        ? prisma.flightLog.findUnique({ where: { id: fee.landingFlightLogId }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!pilot) return NextResponse.json({ error: "Pilote introuvable." }, { status: 400 });
    if (fee.landingFlightLogId && !flight)
      return NextResponse.json({ error: "Vol introuvable." }, { status: 400 });

    const attachment = fee.attachment
      ? await verifyTransactionAttachment(fee.attachment.blobUrl, fee.attachment.fileName)
      : null;
    if (fee.attachment && !attachment) {
      return NextResponse.json(
        { error: "Le justificatif est introuvable dans le stockage — réessaie l'envoi." },
        { status: 400 }
      );
    }

    const debit = -fee.amountCents;
    const tx = await prisma.$transaction(async (db) => {
      const created = await db.accountTransaction.create({
        data: {
          studentId: fee.studentId,
          type: "LANDING_FEE",
          amountCents: debit,
          airfield: fee.airfield,
          landingFlightLogId: fee.landingFlightLogId ?? null,
          reference: fee.reference || null,
          notes: fee.notes || null,
          ...(fee.date ? { date: new Date(fee.date) } : {}),
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedById: session.user.id,
          ...(attachment ? { attachment: { create: attachment } } : {}),
        },
        include: {
          student: { select: safeUserSelect },
          landingFlightLog: { select: landingFlightSelect },
          attachment: { select: safeTransactionAttachmentSelect },
        },
      });
      // upsert : comme pour un ajustement, le compte peut ne pas encore
      // avoir de StudentProfile (ex. un instructeur).
      await db.studentProfile.upsert({
        where: { userId: fee.studentId },
        create: { userId: fee.studentId, balanceCents: debit },
        update: { balanceCents: { increment: debit } },
      });
      return created;
    });

    return NextResponse.json(tx, { status: 201 });
  }

  return NextResponse.json({ error: "type invalide" }, { status: 400 });
}
