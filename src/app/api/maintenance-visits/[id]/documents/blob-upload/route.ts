import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, assertPathnamePrefix } from "@/lib/blob";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// Émet le jeton qui autorise le navigateur à uploader directement vers
// Vercel Blob (voir GestionClasseVirtuelleDetailView.tsx puis
// GestionMaintenanceView.tsx) — même principe que
// /api/admin/documents/blob-upload.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: visitId } = await params;
  const visit = await prisma.maintenanceVisit.findUnique({ where: { id: visitId }, select: { id: true } });
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        assertPathnamePrefix(pathname, "maintenance-visit-documents/");
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'upload." },
      { status: 400 }
    );
  }
}
