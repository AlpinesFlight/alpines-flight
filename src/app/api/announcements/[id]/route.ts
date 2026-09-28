import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { del } from "@vercel/blob";

type Params = { params: Promise<{ id: string }> };

// Supprime une actualité (et ses documents joints, cascade) — admin uniquement.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({
    where: { id },
    include: { attachments: { select: { blobUrl: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.announcement.delete({ where: { id } });

  // Les fiches de pièces jointes disparaissent en cascade avec l'actualité
  // (voir le schéma) — mais pas les fichiers Blob, à nettoyer à la main.
  const blobUrls = existing.attachments.map((a) => a.blobUrl).filter((u): u is string => !!u);
  if (blobUrls.length > 0) {
    try {
      await del(blobUrls);
    } catch (err) {
      console.error(`Suppression des fichiers Blob de l'actualité ${id} échouée :`, err);
    }
  }

  return NextResponse.json({ ok: true });
}
