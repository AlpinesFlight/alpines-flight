import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeDocumentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["VALIDATE", "REJECT"]),
  rejectionReason: z.string().optional().nullable(),
});

// Valide ou rejette un document en attente. Réservé à l'admin. À la
// validation : le document devient le document courant de la qualification,
// et l'ancien document courant (s'il y en avait un) passe en ARCHIVED — il
// reste consultable dans l'historique, jamais supprimé.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const doc = await prisma.qualificationDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.status !== "PENDING") {
    return NextResponse.json({ error: "Ce document a déjà été traité." }, { status: 409 });
  }

  if (parsed.data.action === "REJECT") {
    const updated = await prisma.qualificationDocument.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: parsed.data.rejectionReason || null,
        validatedAt: new Date(),
        validatedById: session.user.id,
      },
      select: safeDocumentSelect,
    });
    return NextResponse.json(updated);
  }

  const result = await prisma.$transaction(async (db) => {
    const qualification = await db.qualification.findUniqueOrThrow({
      where: { id: doc.qualificationId },
    });

    if (qualification.currentDocumentId) {
      await db.qualificationDocument.update({
        where: { id: qualification.currentDocumentId },
        data: { status: "ARCHIVED" },
      });
    }

    const validated = await db.qualificationDocument.update({
      where: { id },
      data: {
        status: "VALIDATED",
        validatedAt: new Date(),
        validatedById: session.user.id,
      },
      select: safeDocumentSelect,
    });

    await db.qualification.update({
      where: { id: doc.qualificationId },
      data: { currentDocumentId: id, lastReminderSentAt: null },
    });

    return validated;
  });

  return NextResponse.json(result);
}
