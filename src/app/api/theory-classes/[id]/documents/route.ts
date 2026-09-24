import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeTheoryClassDocumentSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// Vercel plafonne le corps d'une requête à 4,5 Mo — même limite que
// /api/admin/documents.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const theoryClass = await prisma.theoryClass.findUnique({ where: { id } });
  if (!theoryClass) return NextResponse.json({ error: "not found" }, { status: 404 });

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
    return NextResponse.json(
      { error: "Format non accepté (PDF ou image uniquement)." },
      { status: 400 }
    );
  }

  const document = await prisma.theoryClassDocument.create({
    data: {
      theoryClassId: id,
      fileName: file.name,
      fileMimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      fileData: new Uint8Array(await file.arrayBuffer()),
      uploadedById: session.user.id,
    },
    select: safeTheoryClassDocumentSelect,
  });

  return NextResponse.json(document, { status: 201 });
}
