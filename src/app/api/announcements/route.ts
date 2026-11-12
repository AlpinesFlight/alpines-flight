import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAnnouncementAttachmentSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { head } from "@vercel/blob";
import { z } from "zod";

const MAX_FILES = 5;

// Actualités du tableau de bord. « Tout le monde » : visibles par tous les
// comptes connectés. « Instructeurs » : par la gestion et les instructeurs
// seulement — chacun y voit s'il a confirmé sa lecture ; la gestion voit en
// plus combien de destinataires l'ont lue (détail : .../acknowledgments).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const manager = canManageSchool(session.user.role);
  const seesInstructorNews = manager || session.user.role === "INSTRUCTOR";
  const announcements = await prisma.announcement.findMany({
    where: seesInstructorNews ? undefined : { audience: "ALL" },
    select: {
      id: true,
      title: true,
      body: true,
      audience: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: safeUserSelect },
      attachments: { select: safeAnnouncementAttachmentSelect, orderBy: { uploadedAt: "asc" } },
      recipients: { where: { userId: session.user.id }, select: { notifiedAt: true, acknowledgedAt: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const readCounts = manager
    ? await prisma.announcementRecipient.groupBy({
        by: ["announcementId"],
        where: { announcementId: { in: announcements.map((a) => a.id) }, acknowledgedAt: { not: null } },
        _count: true,
      })
    : [];
  const readBy = new Map(readCounts.map((r) => [r.announcementId, r._count]));

  return NextResponse.json(
    announcements.map(({ recipients, _count, ...a }) => ({
      ...a,
      myReceipt: recipients[0] ?? null,
      ...(manager && a.audience === "INSTRUCTORS"
        ? { recipientCount: _count.recipients, readCount: readBy.get(a.id) ?? 0 }
        : {}),
    }))
  );
}

// Les fichiers sont déjà envoyés à Vercel Blob par le navigateur avant cet
// appel (voir /api/announcements/blob-upload et AnnouncementsCard.tsx) — ce
// POST ne fait plus que créer l'actualité et ses fiches de pièces jointes.
const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  // INSTRUCTORS : réservée aux instructeurs, avec liste de diffusion et
  // accusé de lecture (preuve en cas de contrôle).
  audience: z.enum(["ALL", "INSTRUCTORS"]).default("ALL"),
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

  // Liste de diffusion figée maintenant : tous les comptes instructeurs
  // (profil FI), sauf l'auteur — c'est elle qui prouvera à qui l'actualité a
  // été diffusée, même si l'équipe change ensuite.
  const recipients =
    parsed.data.audience === "INSTRUCTORS"
      ? await prisma.user.findMany({
          where: { instructorProfile: { isNot: null }, id: { not: session.user.id } },
          select: { id: true },
        })
      : [];

  const announcement = await prisma.announcement.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      audience: parsed.data.audience,
      createdById: session.user.id,
      attachments: { create: attachmentsData },
      recipients: { create: recipients.map((r) => ({ userId: r.id })) },
    },
    select: {
      id: true,
      title: true,
      body: true,
      audience: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: safeUserSelect },
      attachments: { select: safeAnnouncementAttachmentSelect, orderBy: { uploadedAt: "asc" } },
    },
  });

  return NextResponse.json(announcement, { status: 201 });
}
