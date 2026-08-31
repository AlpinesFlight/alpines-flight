import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { canManageSchool } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Un admin qui a aussi un profil instructeur (ex. le responsable
  // pédagogique qui vole et instruit lui-même) apparaît ici au même titre
  // qu'un INSTRUCTOR pur : le rôle système et la capacité à instruire sont
  // deux choses distinctes.
  const instructors = await prisma.user.findMany({
    where: { instructorProfile: { isNot: null } },
    select: { ...safeUserSelect, instructorProfile: true },
    orderBy: { lastName: "asc" },
  });
  return NextResponse.json(instructors);
}

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  qualifications: z.string().optional(),
  hourlyRateCents: z.number().int().positive().optional().nullable(),
  color: z.string().optional(),
  // Optionnel : l'admin peut fixer le mot de passe lui-même. Laissé vide,
  // un mot de passe temporaire est généré et renvoyé une fois pour être
  // communiqué à l'instructeur.
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const dup = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (dup) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 });

  const { qualifications, hourlyRateCents, color, password, ...userFields } = parsed.data;

  const tempPassword = password ? null : Math.random().toString(36).slice(-10);
  const passwordHash = await bcrypt.hash(password ?? tempPassword!, 10);

  const user = await prisma.user.create({
    data: {
      ...userFields,
      role: "INSTRUCTOR",
      passwordHash,
      instructorProfile: {
        create: { qualifications, hourlyRateCents, color },
      },
    },
    select: { ...safeUserSelect, instructorProfile: true },
  });

  return NextResponse.json({ user, tempPassword }, { status: 201 });
}
