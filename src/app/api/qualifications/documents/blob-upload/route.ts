import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { canManageSchool } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, assertPathnamePrefix } from "@/lib/blob";

const ALLOWED_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"];

// Émet le jeton qui autorise le navigateur à uploader directement vers
// Vercel Blob (voir LicencesView.tsx) — même principe que
// /api/admin/documents/blob-upload. N'importe quel compte connecté peut
// appeler cette route (comme POST /api/qualifications/documents), mais le
// jeton n'est émis que pour son propre dossier ou, pour le staff, celui de
// n'importe qui — clientPayload porte l'id du compte concerné, envoyé par
// LicencesView.tsx.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        assertPathnamePrefix(pathname, "qualification-documents/");
        if (!canManageSchool(session.user.role) && clientPayload !== session.user.id) {
          throw new Error("unauthorized");
        }
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
