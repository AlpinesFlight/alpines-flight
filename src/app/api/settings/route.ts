import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageFinance, canManageSchool } from "@/lib/permissions";
import { z } from "zod";

const SETTINGS_ID = "singleton";

const SELECT = {
  ibanHolder: true,
  iban: true,
  bic: true,
  bankName: true,
  notes: true,
  notifyOnReservationCreated: true,
  notifyOnReservationCancelled: true,
  notifyReminderEnabled: true,
  updatedAt: true,
  updatedBy: { select: safeUserSelect },
} as const;

const EMPTY = {
  ibanHolder: null,
  iban: null,
  bic: null,
  bankName: null,
  notes: null,
  notifyOnReservationCreated: true,
  notifyOnReservationCancelled: true,
  notifyReminderEnabled: true,
  updatedAt: null,
  updatedBy: null,
};

// Réglages école — une seule ligne, deux familles de champs à droits
// différents (voir PATCH). Lisible par tout utilisateur connecté : un
// pilote doit voir l'IBAN pour pouvoir virer de l'argent sur son compte.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await prisma.schoolSettings.findUnique({ where: { id: SETTINGS_ID }, select: SELECT });
  return NextResponse.json(settings ?? EMPTY);
}

const FINANCE_KEYS = ["ibanHolder", "iban", "bic", "bankName", "notes"] as const;

const patchSchema = z.object({
  ibanHolder: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  bic: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  notifyOnReservationCreated: z.boolean().optional(),
  notifyOnReservationCancelled: z.boolean().optional(),
  notifyReminderEnabled: z.boolean().optional(),
});

// Upsert de la ligne unique de réglages — deux droits distincts sur le même
// endpoint : les champs IBAN (finance) exigent le Gérant, les réglages de
// notification (gestion courante) exigent seulement l'Admin. Une requête ne
// peut mélanger les deux sans avoir les deux droits.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const touchesFinance = FINANCE_KEYS.some((k) => k in body);
  if (touchesFinance && !canManageFinance(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canManageSchool(session.user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await prisma.schoolSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...parsed.data, updatedById: session.user.id },
    update: { ...parsed.data, updatedById: session.user.id },
    select: SELECT,
  });
  return NextResponse.json(settings);
}
