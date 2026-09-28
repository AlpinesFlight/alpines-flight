import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGerant } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, assertPathnamePrefix } from "@/lib/blob";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// Émet le jeton qui autorise le navigateur à uploader directement vers
// Vercel Blob (voir GestionClasseVirtuelleDetailView.tsx) — même principe
// que /api/admin/documents/blob-upload.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const theoryClass = await prisma.theoryClass.findUnique({ where: { id }, select: { id: true } });
  if (!theoryClass) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        assertPathnamePrefix(pathname, "theory-class-documents/");
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
