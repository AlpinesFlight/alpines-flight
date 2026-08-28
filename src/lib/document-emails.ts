import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderEmailShell, p, h2, box, fieldRow } from "@/lib/email-templates";
import type { DocumentVisibility } from "@prisma/client";

// Notifie tous les comptes concernés par la visibilité choisie (hors
// l'auteur lui-même) qu'un nouveau document est en ligne, et fige la liste
// des destinataires dans DocumentNotification — c'est cette liste figée,
// avec la date d'accusé de lecture de chacun, qui sert de preuve en cas de
// contrôle DGAC (voir le modèle dans schema.prisma). Best-effort pour
// l'envoi d'email : la création du document ne doit jamais en dépendre.
export async function notifyNewDocument(document: {
  id: string;
  title: string;
  category: string | null;
  visibility: DocumentVisibility;
  uploadedById: string;
}) {
  const recipients = await prisma.user.findMany({
    where: {
      id: { not: document.uploadedById },
      ...(document.visibility === "FI_ONLY" ? { role: { in: ["GERANT", "ADMIN", "INSTRUCTOR"] } } : {}),
    },
    select: { id: true, firstName: true, email: true },
  });
  if (recipients.length === 0) return;

  // Liste figée des destinataires — indépendante du succès de l'envoi email
  // (même si le mailer est mal configuré, la trace "à qui c'était destiné"
  // doit exister).
  await prisma.documentNotification.createMany({
    data: recipients.map((r) => ({ documentId: document.id, userId: r.id })),
    skipDuplicates: true,
  });

  const appUrl = process.env.AUTH_URL || "https://dtoalpinesflight.com";
  const docUrl = `${appUrl}/documentation`;

  await Promise.all(
    recipients.map(async (r) => {
      const bodyHtml = [
        h2("Nouveau document disponible"),
        p(`Bonjour ${r.firstName},`),
        p("Un nouveau document vient d'être publié sur l'appli. Merci d'en prendre connaissance et de le confirmer."),
        box(fieldRow("Titre", document.title) + (document.category ? fieldRow("Catégorie", document.category) : "")),
        p("<em>Une confirmation de lecture est demandée pour ce document (traçabilité réglementaire).</em>"),
      ].join("");
      const html = renderEmailShell({ bodyHtml, ctaText: "Voir le document", ctaUrl: docUrl });
      const text = `Bonjour ${r.firstName},\n\nUn nouveau document vient d'être publié : ${document.title}${
        document.category ? ` (${document.category})` : ""
      }.\n\nMerci d'en prendre connaissance et de confirmer sa lecture sur : ${docUrl}`;

      try {
        await sendMail({ to: [r.email], subject: `Nouveau document — ${document.title}`, text, html });
      } catch {
        // Silencieux : voir commentaire ci-dessus.
      }
    })
  );
}
