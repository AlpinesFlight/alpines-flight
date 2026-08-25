import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  role: z.enum(["GERANT", "ADMIN", "INSTRUCTOR", "STUDENT"]),
});

// Change le rôle d'un compte — réservé au Gérant, seul habilité à distribuer
// les droits d'accès (voir src/lib/permissions.ts). Les profils
// (InstructorProfile / StudentProfile) sont indépendants du rôle système et
// ne sont jamais supprimés ici (un historique de qualifications ou un solde
// de compte pilote ne doit pas disparaître si le rôle change) — on crée
// juste le profil manquant quand il devient nécessaire pour le nouveau rôle.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Un Gérant ne peut pas changer son propre rôle depuis cette page — évite
  // de se verrouiller soi-même hors des finances par erreur de clic. Un
  // transfert de la gérance se fait volontairement, par un autre compte
  // Gérant.
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "Tu ne peux pas modifier ton propre rôle. Fais-le modifier par un autre compte Gérant." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, studentProfile: { select: { id: true } }, instructorProfile: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { role } = parsed.data;

  const user = await prisma.user.update({
    where: { id },
    data: {
      role,
      ...(role === "STUDENT" && !existing.studentProfile
        ? { studentProfile: { create: {} } }
        : {}),
      ...(role === "INSTRUCTOR" && !existing.instructorProfile
        ? { instructorProfile: { create: {} } }
        : {}),
    },
    select: {
      ...safeUserSelect,
      studentProfile: { select: { id: true } },
      instructorProfile: { select: { id: true } },
    },
  });
  return NextResponse.json(user);
}
