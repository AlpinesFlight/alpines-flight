import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; docId: string }> };

// Diffuse le contenu binaire d'un document de visite — jamais en JSON (voir
// safeMaintenanceVisitDocumentSelect), même logique que
// /api/admin/documents/[id]/file.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: visitId, docId } = await params;
  const doc = await prisma.maintenanceVisitDocument.findUnique({
    where: { id: docId },
    select: { visitId: true, fileData: true, fileMimeType: true, fileName: true },
  });
  if (!doc || doc.visitId !== visitId) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(doc.fileData), {
    headers: {
      "Content-Type": doc.fileMimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
