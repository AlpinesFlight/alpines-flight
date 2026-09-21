import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAdminDocumentSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";

// Vercel plafonne le corps d'une requête à 4,5 Mo — même limite fixe de
// plateforme que /api/documents (voir ce fichier), non contournable. Le
// frontend compresse déjà toute photo prise depuis l'appareil avant envoi
// (voir GestionDocumentsView.tsx) pour rester confortablement en dessous.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// Documents à transmettre au comptable (factures, relevés...) — page
// /gestion, réservée au Gérant. ?status=PENDING|PROCESSED filtre la liste ;
// sans filtre, tout est renvoyé (le volume attendu ici reste faible).
export async function GET(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status = statusParam === "PENDING" || statusParam === "PROCESSED" ? statusParam : undefined;

  const documents = await prisma.adminDocument.findMany({
    where: status ? { status } : undefined,
    select: safeAdminDocumentSelect,
    orderBy: [{ status: "asc" }, { uploadedAt: "desc" }],
  });
  return NextResponse.json(documents);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const category = form.get("category") ? String(form.get("category")).trim() || null : null;
  const file = form.get("file");

  if (!title) return NextResponse.json({ error: "Le titre est requis." }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (4 Mo max)." }, { status: 400 });
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Format non accepté (PDF ou image uniquement)." },
      { status: 400 }
    );
  }

  const document = await prisma.adminDocument.create({
    data: {
      title,
      category,
      fileName: file.name,
      fileMimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      fileData: new Uint8Array(await file.arrayBuffer()),
      uploadedById: session.user.id,
    },
    select: safeAdminDocumentSelect,
  });

  return NextResponse.json(document, { status: 201 });
}
