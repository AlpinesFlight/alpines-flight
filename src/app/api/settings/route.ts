import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageFinance } from "@/lib/permissions";
import { z } from "zod";

const SETTINGS_ID = "singleton";

// Réglages école (IBAN pour les virements, etc.) — une seule ligne. Lisible
// par tout utilisateur connecté : un pilote doit voir l'IBAN pour pouvoir
// virer de l'argent sur son compte pilote.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await prisma.schoolSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      ibanHolder: true,
      iban: true,
      bic: true,
      bankName: true,
      notes: true,
      updatedAt: true,
      updatedBy: { select: safeUserSelect },
    },
  });
  return NextResponse.json(
    settings ?? { ibanHolder: null, iban: null, bic: null, bankName: null, notes: null, updatedAt: null, updatedBy: null }
  );
}

const patchSchema = z.object({
  ibanHolder: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  bic: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Gérant uniquement (finance) — upsert la ligne unique de réglages.
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const settings = await prisma.schoolSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...parsed.data, updatedById: session.user.id },
    update: { ...parsed.data, updatedById: session.user.id },
    select: {
      ibanHolder: true,
      iban: true,
      bic: true,
      bankName: true,
      notes: true,
      updatedAt: true,
      updatedBy: { select: safeUserSelect },
    },
  });
  return NextResponse.json(settings);
}
