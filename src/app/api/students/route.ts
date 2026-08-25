import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { safeUserSelect } from "@/lib/selects";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Le trombinoscope complet (utile pour les pickers élève/instructeur) est
  // visible de tous les comptes connectés, mais le solde du compte pilote et
  // les données médicales/notes internes sont des informations financières
  // ou sensibles réservées au staff pédagogique (FI et au-dessus) — un élève
  // ne doit pas pouvoir consulter le solde ou le certificat médical d'un
  // autre élève simplement en ouvrant sa page Facturation/Licences.
  const staff = isInstructorOrAbove(session.user.role);

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: {
      ...safeUserSelect,
      studentProfile: staff
        ? true
        : {
            select: {
              id: true,
              userId: true,
              licenseType: true,
              totalHours: true,
              isPilot: true,
              createdAt: true,
              updatedAt: true,
            },
          },
    },
    orderBy: { lastName: "asc" },
  });
  return NextResponse.json(students);
}

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  licenseType: z.string().optional(),
  // true = pilote déjà breveté (affiché "Pilote" plutôt que "Élève" sur la
  // page Élèves) — même rôle système STUDENT dans les deux cas.
  isPilot: z.boolean().optional(),
  // Optionnel : l'admin peut fixer le mot de passe lui-même. Laissé vide,
  // un mot de passe temporaire est généré et renvoyé une fois pour être
  // communiqué à l'élève.
  password: z.string().min(8, "8 caractères minimum").optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const dup = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (dup) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 });

  const { password, ...fields } = parsed.data;
  const tempPassword = password ? null : Math.random().toString(36).slice(-10);
  const passwordHash = await bcrypt.hash(password ?? tempPassword!, 10);

  const user = await prisma.user.create({
    data: {
      ...fields,
      role: "STUDENT",
      passwordHash,
      studentProfile: {
        create: { licenseType: fields.licenseType, isPilot: fields.isPilot ?? false },
      },
    },
    select: { ...safeUserSelect, studentProfile: true },
  });

  return NextResponse.json({ user, tempPassword }, { status: 201 });
}
