import { prisma } from "./prisma";

// Une qualification est "due" pour relance si son document courant validé a
// une échéance, que l'on est entré dans sa fenêtre de rappel (butée
// définissable par qualification), et qu'aucun rappel n'a été envoyé
// récemment (pour ne pas relancer tous les jours tant que rien n'a changé).
export async function findDueQualifications() {
  const all = await prisma.qualification.findMany({
    where: { currentDocument: { expiresAt: { not: null } } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      // select plutôt que true : cette liste part telle quelle en JSON vers
      // le tableau de bord (GET /api/qualifications/due) — currentDocument
      // complet aurait envoyé le scan/PDF de licence de chaque élève à
      // chaque chargement du tableau de bord.
      currentDocument: { select: { expiresAt: true } },
    },
    orderBy: { currentDocument: { expiresAt: "asc" } },
  });

  const now = Date.now();
  const RESEND_AFTER_DAYS = 14;

  return all.filter((q) => {
    const expiresAt = q.currentDocument?.expiresAt;
    if (!expiresAt) return false;
    const windowStart = expiresAt.getTime() - q.reminderDaysBefore * 86_400_000;
    if (now < windowStart) return false; // pas encore dans la fenêtre
    if (!q.lastReminderSentAt) return true;
    const daysSinceLastReminder = (now - q.lastReminderSentAt.getTime()) / 86_400_000;
    return daysSinceLastReminder >= RESEND_AFTER_DAYS;
  });
}

const TYPE_LABEL: Record<string, string> = {
  LICENSE: "Licence",
  MEDICAL: "Certificat médical",
  CLASS_RATING: "Qualification de classe",
  VARIANT: "Variante",
  ADDITIONAL: "Qualification additionnelle",
  INSTRUCTOR_PRIV: "Privilège instructeur",
  EXAMINER_PRIV: "Privilège examinateur",
  OTHER: "Document",
};

export function composeReminderEmail(q: {
  label: string;
  type: string;
  currentDocument: { expiresAt: Date | null } | null;
  user: { firstName: string; lastName: string };
}) {
  const expiresAt = q.currentDocument?.expiresAt ?? null;
  const dateStr = expiresAt
    ? expiresAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "date inconnue";
  const isPast = expiresAt ? expiresAt.getTime() < Date.now() : false;

  const subject = isPast
    ? `[Alpines Flight] ${TYPE_LABEL[q.type] ?? q.type} expiré(e) — ${q.label}`
    : `[Alpines Flight] ${TYPE_LABEL[q.type] ?? q.type} à renouveler bientôt — ${q.label}`;

  const text = `Bonjour ${q.user.firstName},

${isPast ? "Votre document suivant est arrivé à expiration" : "Votre document suivant arrive bientôt à expiration"} :

  ${TYPE_LABEL[q.type] ?? q.type} — ${q.label}
  ${isPast ? "Expiré le" : "Expire le"} : ${dateStr}

Merci de transmettre le document de renouvellement (photo ou scan) via l'application dès que possible, afin qu'il soit vérifié et pris en compte.

Alpines Flight`;

  return { subject, text };
}
