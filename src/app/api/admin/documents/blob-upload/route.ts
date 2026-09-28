import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { isGerant } from "@/lib/permissions";

const ALLOWED_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
// L'upload va directement du navigateur au stockage Blob — la limite dure de
// 4,5 Mo sur le corps d'une requête serverless (voir /api/admin/documents,
// avant cette migration) ne s'applique plus. 20 Mo reste un garde-fou large
// contre un fichier choisi par erreur, bien au-dessus de tout PDF ou photo
// de facture/relevé.
const MAX_BLOB_BYTES = 20 * 1024 * 1024;

// Émet le jeton qui autorise le navigateur à uploader directement vers
// Vercel Blob (voir GestionDocumentsView.tsx). Le document (titre,
// catégorie...) n'est créé qu'ensuite, par un POST classique vers
// /api/admin/documents une fois l'upload terminé — pas via le webhook
// onUploadCompleted de Vercel (il ne peut pas joindre localhost en dev, ce
// qui rendrait les échecs silencieux en local).
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("admin-documents/")) {
          throw new Error("Chemin de fichier invalide.");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BLOB_BYTES,
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
