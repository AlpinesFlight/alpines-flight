import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGerant } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// Diffuse le contenu binaire d'un document de préparation de vol — jamais en
// JSON (voir safeFlightPrepDocumentSelect), même logique que
// /api/admin/documents/[id]/file.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.flightPrepDocument.findUnique({
    where: { id },
    select: { fileData: true, fileMimeType: true, fileName: true },
  });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(doc.fileData), {
    headers: {
      "Content-Type": doc.fileMimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
