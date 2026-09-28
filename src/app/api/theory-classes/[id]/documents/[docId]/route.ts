import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGerant } from "@/lib/permissions";
import { del } from "@vercel/blob";

type Params = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, docId } = await params;
  const existing = await prisma.theoryClassDocument.findUnique({ where: { id: docId } });
  if (!existing || existing.theoryClassId !== id)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.theoryClassDocument.delete({ where: { id: docId } });

  if (existing.blobUrl) {
    try {
      await del(existing.blobUrl);
    } catch (err) {
      console.error(`Suppression du fichier Blob de TheoryClassDocument ${docId} échouée :`, err);
    }
  }

  return NextResponse.json({ ok: true });
}
