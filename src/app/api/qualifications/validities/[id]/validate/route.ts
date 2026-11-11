import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { makeCurrent } from "@/lib/qualifications";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["VALIDATE", "REJECT"]),
  rejectionReason: z.string().optional().nullable(),
});

// Valide ou rejette une validité déclarée par un pilote. Réservé au
// Gérant/Admin. À la validation, elle devient la validité courante et
// l'ancienne passe en ARCHIVED — consultable dans l'historique, jamais
// supprimée.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const validity = await prisma.qualificationValidity.findUnique({ where: { id } });
  if (!validity) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (validity.status !== "PENDING") {
    return NextResponse.json({ error: "Cette déclaration a déjà été traitée." }, { status: 409 });
  }

  if (parsed.data.action === "REJECT") {
    await prisma.qualificationValidity.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: parsed.data.rejectionReason || null,
        validatedAt: new Date(),
        validatedById: session.user.id,
      },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction((db) => makeCurrent(db, validity.qualificationId, id, session.user.id));
  return NextResponse.json({ ok: true });
}
