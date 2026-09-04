import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeDocumentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"]);

// Importe un nouveau document (renouvellement) pour une qualification —
// existante (qualificationId fourni) ou nouvelle (type + label fournis).
// Reste PENDING tant que l'admin ne l'a pas validé : voir
// /api/qualifications/documents/[id]/validate.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  const userId = String(form.get("userId") ?? "");
  const qualificationId = form.get("qualificationId") ? String(form.get("qualificationId")) : null;
  const type = form.get("type") ? String(form.get("type")) : null;
  const label = form.get("label") ? String(form.get("label")) : null;
  const reminderDaysBefore = form.get("reminderDaysBefore")
    ? parseInt(String(form.get("reminderDaysBefore")), 10)
    : 45;
  const number = form.get("number") ? String(form.get("number")) : null;
  const issuedAt = form.get("issuedAt") ? String(form.get("issuedAt")) : null;
  const expiresAt = form.get("expiresAt") ? String(form.get("expiresAt")) : null;
  const notes = form.get("notes") ? String(form.get("notes")) : null;
  const file = form.get("file");

  if (!userId) return NextResponse.json({ error: "userId manquant." }, { status: 400 });
  if (!canManageSchool(session.user.role) && userId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Un document sans fichier n'a rien à faire valider : ça a déjà produit
  // un document "courant" vide masquant silencieusement, dans l'historique,
  // le vrai document avec son fichier — revérifié ici, jamais fait
  // confiance au seul contrôle du formulaire.
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Un fichier est requis." }, { status: 400 });
  }

  let qualification;
  if (qualificationId) {
    qualification = await prisma.qualification.findUnique({ where: { id: qualificationId } });
    if (!qualification || qualification.userId !== userId) {
      return NextResponse.json({ error: "Qualification introuvable." }, { status: 404 });
    }
  } else {
    if (!type || !label) {
      return NextResponse.json(
        { error: "type et label sont requis pour créer une nouvelle qualification." },
        { status: 400 }
      );
    }
    qualification = await prisma.qualification.create({
      data: { userId, type: type as never, label, reminderDaysBefore },
    });
  }

  let fileName: string | null = null;
  let fileMimeType: string | null = null;
  let fileSize: number | null = null;
  let fileData: Uint8Array<ArrayBuffer> | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)." }, { status: 400 });
    }
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Format non accepté (PDF, JPEG, PNG, HEIC ou WebP uniquement)." },
        { status: 400 }
      );
    }
    fileName = file.name;
    fileMimeType = file.type || "application/octet-stream";
    fileSize = file.size;
    fileData = new Uint8Array(await file.arrayBuffer());
  }

  const document = await prisma.qualificationDocument.create({
    data: {
      qualificationId: qualification.id,
      number,
      issuedAt: issuedAt ? new Date(issuedAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes,
      fileName,
      fileMimeType,
      fileSize,
      fileData,
      status: "PENDING",
      uploadedById: session.user.id,
    },
    select: safeDocumentSelect,
  });

  return NextResponse.json(document, { status: 201 });
}
