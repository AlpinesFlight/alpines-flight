import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAnnouncementAttachmentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { head } from "@vercel/blob";
import { z } from "zod";

const MAX_FILES = 5;

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

// Les fichiers sont déjà envoyés à Vercel Blob par le navigateur avant cet
// appel (voir /api/announcements/blob-upload et AnnouncementsCard.tsx) — ce
// POST ne fait plus que créer l'actualité et ses fiches de pièces jointes.
const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  attachments: z
    .array(z.object({ fileName: z.string().min(1), blobUrl: z.string().url() }))
    .max(MAX_FILES, `${MAX_FILES} documents maximum par actualité.`)
    .default([]),
});

// Publie une actualité, avec 0 à 5 documents joints — admin uniquement.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  // Vérifie que chaque fichier existe vraiment dans Blob et récupère
  // taille/type réels — jamais ceux annoncés par le client.
  const attachmentsData = await Promise.all(
    parsed.data.attachments.map(async (a) => {
      const meta = await head(a.blobUrl);
      return {
        fileName: a.fileName,
        fileMimeType: meta.contentType || "application/octet-stream",
        fileSize: meta.size,
        blobUrl: a.blobUrl,
      };
    })
  ).catch(() => null);
  if (attachmentsData === null) {
    return NextResponse.json(
      { error: "Une pièce jointe est introuvable dans le stockage — réessaie l'envoi." },
      { status: 400 }
    );
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
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
