import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAdminDocumentSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { del } from "@vercel/blob";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["PENDING", "PROCESSED"]).optional(),
  title: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Change le statut (ex: "traité" une fois récupéré par le comptable) ou
// corrige le titre/la catégorie/les notes d'un document — jamais le fichier
// lui-même (le supprimer et le reposter pour ça).
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const existing = await prisma.adminDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { status, ...rest } = parsed.data;
  const document = await prisma.adminDocument.update({
    where: { id },
    data: {
      ...rest,
      ...(status ? { status, processedAt: status === "PROCESSED" ? new Date() : null } : {}),
    },
    select: safeAdminDocumentSelect,
  });
  return NextResponse.json(document);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.adminDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.adminDocument.delete({ where: { id } });

  // Supprime aussi le fichier dans Blob — sinon il resterait orphelin (payé,
  // invisible) indéfiniment. Après la suppression de la fiche : un blob
  // orphelin ne coûte qu'un peu de stockage inutile, alors qu'un échec ici
  // qui empêcherait la suppression de la fiche serait bien plus gênant.
  if (existing.blobUrl) {
    try {
      await del(existing.blobUrl);
    } catch (err) {
      console.error(`Suppression du fichier Blob de AdminDocument ${id} échouée :`, err);
    }
  }

  return NextResponse.json({ ok: true });
}
