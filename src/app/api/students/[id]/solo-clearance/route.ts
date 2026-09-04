import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  soloGrassCleared: z.boolean().optional(),
  soloPavedCleared: z.boolean().optional(),
});

// Lâchers solo (piste en herbe / piste en dur) — deux autorisations
// indépendantes. Jugement pédagogique du FI, pas une question financière :
// séparé du PATCH principal /api/students/[id] (réservé Admin/Gérant) pour
// que l'INSTRUCTOR puisse lâcher ses élèves sans lui ouvrir le reste du
// profil (nom, licence, isPilot...), même logique que la note sur
// isInstructorOrAbove dans src/lib/permissions.ts.
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isInstructorOrAbove(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const existing = await prisma.studentProfile.findUnique({ where: { userId: id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const profile = await prisma.studentProfile.update({
    where: { userId: id },
    data: parsed.data,
    select: { userId: true, soloGrassCleared: true, soloPavedCleared: true },
  });
  return NextResponse.json(profile);
}
