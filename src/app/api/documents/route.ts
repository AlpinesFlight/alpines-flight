import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeSchoolDocumentSelect } from "@/lib/selects";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 Mo — manuels/procédures, potentiellement volumineux
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Documentation de l'école (procédures, manuels, réglementation...). Un
// élève/pilote ne voit que les documents ALL ; le staff pédagogique (FI et
// au-dessus) voit aussi les documents FI_ONLY (ex. notes internes,
// procédures d'instruction) — voir SchoolDocument.visibility.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const staff = isInstructorOrAbove(session.user.role);

  const documents = await prisma.schoolDocument.findMany({
    where: staff ? undefined : { visibility: "ALL" },
    select: safeSchoolDocumentSelect,
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  return NextResponse.json(documents);
}

// Publie un document — admin uniquement (gestion de l'école, pas une
// question financière).
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const category = form.get("category") ? String(form.get("category")).trim() || null : null;
  const visibilityRaw = String(form.get("visibility") ?? "ALL");
  const visibility = visibilityRaw === "FI_ONLY" ? "FI_ONLY" : "ALL";
  const file = form.get("file");

  if (!title) return NextResponse.json({ error: "Le titre est requis." }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (20 Mo max)." }, { status: 400 });
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Format non accepté (PDF, image, Word ou Excel uniquement)." },
      { status: 400 }
    );
  }

  const document = await prisma.schoolDocument.create({
    data: {
      title,
      category,
      visibility,
      fileName: file.name,
      fileMimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      fileData: new Uint8Array(await file.arrayBuffer()),
      uploadedById: session.user.id,
    },
    select: safeSchoolDocumentSelect,
  });

  return NextResponse.json(document, { status: 201 });
}
