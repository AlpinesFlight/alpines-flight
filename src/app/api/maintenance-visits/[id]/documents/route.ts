import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeMaintenanceVisitDocumentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// Documents d'une visite (bon de travail, facture atelier, rapport...) —
// même limite plateforme que /api/admin/documents (Vercel : 4,5 Mo max par
// requête, non contournable sans stockage externe).
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: visitId } = await params;
  const visit = await prisma.maintenanceVisit.findUnique({ where: { id: visitId } });
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (4 Mo max)." }, { status: 400 });
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Format non accepté (PDF ou image uniquement)." }, { status: 400 });
  }

  const document = await prisma.maintenanceVisitDocument.create({
    data: {
      visitId,
      fileName: file.name,
      fileMimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      fileData: new Uint8Array(await file.arrayBuffer()),
      uploadedById: session.user.id,
    },
    select: safeMaintenanceVisitDocumentSelect,
  });

  return NextResponse.json(document, { status: 201 });
}
