import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeMaintenanceVisitDocumentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { head } from "@vercel/blob";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

// Le fichier lui-même est déjà envoyé à Vercel Blob par le navigateur avant
// cet appel (voir .../blob-upload et GestionMaintenanceView.tsx) — ce POST
// ne fait plus que créer la fiche.
const createSchema = z.object({
  fileName: z.string().min(1),
  blobUrl: z.string().url(),
});

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: visitId } = await params;
  const visit = await prisma.maintenanceVisit.findUnique({ where: { id: visitId } });
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  let meta;
  try {
    meta = await head(parsed.data.blobUrl);
  } catch {
    return NextResponse.json(
      { error: "Fichier introuvable dans le stockage — réessaie l'envoi." },
      { status: 400 }
    );
  }

  const document = await prisma.maintenanceVisitDocument.create({
    data: {
      visitId,
      fileName: parsed.data.fileName,
      fileMimeType: meta.contentType || "application/octet-stream",
      fileSize: meta.size,
      blobUrl: parsed.data.blobUrl,
      uploadedById: session.user.id,
    },
    select: safeMaintenanceVisitDocumentSelect,
  });

  return NextResponse.json(document, { status: 201 });
}
