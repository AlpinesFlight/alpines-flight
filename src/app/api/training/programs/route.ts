import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Par défaut, seuls les programmes actifs (utilisés pour les pickers
  // d'inscription/réservation). ?all=true (réservé à l'admin) renvoie aussi
  // les désactivés, pour le bloc de gestion des programmes.
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "true" && canManageSchool(session.user.role);

  const programs = await prisma.trainingProgram.findMany({
    where: includeInactive ? undefined : { active: true },
    include: { phases: { select: { id: true, _count: { select: { exercises: true } } } } },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(programs);
}

const createSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  category: z.string().optional().nullable(),
  modality: z.string().optional().nullable(),
});

// Crée un programme "vide" (sans phases/exercices) — à compléter plus tard,
// ou simplement utile pour un programme "maison" ne suivant pas le format
// des livrets DTO importés (ex: familiarisation, vol découverte...). Admin
// uniquement.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const dup = await prisma.trainingProgram.findUnique({ where: { code: parsed.data.code } });
  if (dup) return NextResponse.json({ error: "Ce code de programme est déjà utilisé." }, { status: 409 });

  const program = await prisma.trainingProgram.create({
    data: parsed.data,
    include: { phases: { select: { id: true, _count: { select: { exercises: true } } } } },
  });
  return NextResponse.json(program, { status: 201 });
}
