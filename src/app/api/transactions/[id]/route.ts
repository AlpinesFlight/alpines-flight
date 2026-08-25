import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { safeUserSelect } from "@/lib/selects";
import { canManageFinance } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum(["CONFIRM", "REJECT"]),
});

const editSchema = z.object({
  type: z.enum(["DEPOSIT", "FLIGHT_DEBIT", "ADJUSTMENT"]).optional(),
  amountCents: z.number().int().refine((n) => n !== 0, "Le montant ne peut pas être nul.").optional(),
  method: z.enum(["CARD", "TRANSFER", "CASH", "CHECK"]).nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// PATCH sert deux usages, distingués par la forme du corps :
// - { action: "CONFIRM"|"REJECT" } — vérification d'un versement en attente
//   (comportement historique, inchangé).
// - tout le reste — édition libre d'un mouvement par l'admin (montant,
//   moyen, référence, notes). Si le mouvement est déjà CONFIRMED, le solde
//   du pilote est corrigé du delta pour rester exact. Ne touche jamais le
//   FlightLog relié le cas échéant : éditer la ligne comptable d'un vol ne
//   remet pas à jour le détail du vol lui-même (voir /api/flights/[id]
//   pour éditer le vol, qui lui garde sa transaction synchronisée).
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  if (body && typeof body === "object" && "action" in body) {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const existing = await prisma.accountTransaction.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (existing.status !== "PENDING")
      return NextResponse.json({ error: "Ce versement a déjà été traité." }, { status: 409 });

    const newStatus = parsed.data.action === "CONFIRM" ? "CONFIRMED" : "REJECTED";

    const tx = await prisma.$transaction(async (db) => {
      const updated = await db.accountTransaction.update({
        where: { id },
        data: { status: newStatus, confirmedAt: new Date(), confirmedById: session.user.id },
        include: { student: { select: safeUserSelect } },
      });
      if (newStatus === "CONFIRMED") {
        await db.studentProfile.update({
          where: { userId: existing.studentId },
          data: { balanceCents: { increment: existing.amountCents } },
        });
      }
      return updated;
    });

    return NextResponse.json(tx);
  }

  const parsed = editSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.accountTransaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const amountDelta =
    parsed.data.amountCents !== undefined ? parsed.data.amountCents - existing.amountCents : 0;

  const tx = await prisma.$transaction(async (db) => {
    const updated = await db.accountTransaction.update({
      where: { id },
      data: parsed.data,
      include: { student: { select: safeUserSelect } },
    });
    if (existing.status === "CONFIRMED" && amountDelta !== 0) {
      await db.studentProfile.update({
        where: { userId: existing.studentId },
        data: { balanceCents: { increment: amountDelta } },
      });
    }
    return updated;
  });

  return NextResponse.json(tx);
}

// Supprime un mouvement — corrige le solde du pilote s'il était CONFIRMED
// (annule son effet), sans jamais toucher au vol relié le cas échéant (le
// vol reste dans le carnet ; voir /api/flights/[id] pour supprimer le vol
// lui-même, qui lui supprime aussi sa transaction). Admin uniquement.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.accountTransaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.$transaction(async (db) => {
    if (existing.status === "CONFIRMED") {
      await db.studentProfile.update({
        where: { userId: existing.studentId },
        data: { balanceCents: { decrement: existing.amountCents } },
      });
    }
    await db.accountTransaction.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}
