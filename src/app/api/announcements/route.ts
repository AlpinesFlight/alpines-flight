import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAnnouncementAttachmentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";

// Vercel plafonne le corps d'une requête à 4,5 Mo, tous fichiers confondus
// pour cette route (plusieurs pièces jointes possibles) — au-delà, la
// plateforme rejette la requête avant même qu'elle n'atteigne ce code (413
// générique, sans le message clair ci-dessous). Limite fixe, non
// contournable ni en config ni en code. 4 Mo de marge de sécurité.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Actualités du tableau de bord — visibles par tous les comptes connectés.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const announcements = await prisma.announcement.findMany({
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: safeUserSelect },
      attachments: { select: safeAnnouncementAttachmentSelect, orderBy: { uploadedAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json(announcements);
}

// Publie une actualité, avec 0 à 5 documents joints — admin uniquement.
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
  const body = String(form.get("body") ?? "").trim();
  if (!title || !body) {
    return NextResponse.json({ error: "Le titre et le texte sont requis." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `5 documents maximum par actualité.` }, { status: 400 });
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Les pièces jointes dépassent 4 Mo au total (limite technique, toutes pièces jointes confondues)." },
      { status: 400 }
    );
  }
  for (const file of files) {
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `« ${file.name} » : format non accepté (PDF, image, Word ou Excel uniquement).` },
        { status: 400 }
      );
    }
  }

  const attachmentsData = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      fileMimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      fileData: new Uint8Array(await file.arrayBuffer()),
    }))
  );

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      createdById: session.user.id,
      attachments: { create: attachmentsData },
    },
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: safeUserSelect },
      attachments: { select: safeAnnouncementAttachmentSelect, orderBy: { uploadedAt: "asc" } },
    },
  });

  return NextResponse.json(announcement, { status: 201 });
}
