import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeSchoolDocumentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ archived: z.boolean() });

// Archive ou désarchive un document — admin uniquement. Ne touche ni le
// fichier ni les accusés de lecture déjà enregistrés, juste sa visibilité
// dans la liste active (voir GET /api/documents et SchoolDocument.archived).
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const existing = await prisma.schoolDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const document = await prisma.schoolDocument.update({
    where: { id },
    data: { archived: parsed.data.archived },
    select: safeSchoolDocumentSelect,
  });
  return NextResponse.json(document);
}

// Retire un document — admin uniquement.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.schoolDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.schoolDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
