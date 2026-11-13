import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, assertPathnamePrefix } from "@/lib/blob";
import { TRANSACTION_ATTACHMENT_PREFIX, TRANSACTION_ATTACHMENT_TYPES } from "@/lib/transaction-attachments";

// Émet le jeton qui autorise le navigateur à envoyer directement vers Vercel
// Blob le justificatif d'un mouvement (facture d'une taxe d'atterrissage) —
// avant l'enregistrement du mouvement lui-même. Gérant uniquement.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageFinance(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        assertPathnamePrefix(pathname, TRANSACTION_ATTACHMENT_PREFIX);
        return {
          allowedContentTypes: TRANSACTION_ATTACHMENT_TYPES,
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
