import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { canManageSchool } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, assertPathnamePrefix } from "@/lib/blob";

// Formats affichables directement en <img> — pas de PDF/HEIC ici (contrairement
// aux documents de licences, cette photo s'affiche en ligne sur la carte avion.
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Émet le jeton qui autorise le navigateur à uploader directement vers
// Vercel Blob (voir FleetView.tsx) — même principe que
// /api/admin/documents/blob-upload.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        assertPathnamePrefix(pathname, "aircraft-photos/");
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
