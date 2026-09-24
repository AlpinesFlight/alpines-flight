import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";

type Params = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: visitId, docId } = await params;
  const doc = await prisma.maintenanceVisitDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.visitId !== visitId) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.maintenanceVisitDocument.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}
