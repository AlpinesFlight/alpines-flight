import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderEmailShell, p, h2, box, fieldRow } from "@/lib/email-templates";
import { formatDateTime } from "@/lib/format";
import type { Aircraft, Reservation } from "@prisma/client";

// Forme "safe" (voir safeUserSelect) — jamais le User complet (passwordHash).
type SafeUser = { firstName: string; email: string };

type ReservationWithRelations = Reservation & {
  aircraft: Aircraft;
  student: SafeUser | null;
  instructor: SafeUser | null;
};

const TYPE_LABELS: Record<string, string> = {
  INSTRUCTION: "Vol d'instruction",
  SOLO: "Vol solo",
  LOCATION: "Location",
  MAINTENANCE: "Maintenance",
  DISCOVERY: "Vol découverte",
};

type Kind = "created" | "cancelled" | "reminder";

const SUBJECT: Record<Kind, string> = {
  created: "Réservation confirmée",
  cancelled: "Réservation annulée",
  reminder: "Rappel — vol demain",
};
const HEADING: Record<Kind, string> = {
  created: "Réservation confirmée",
  cancelled: "Réservation annulée",
  reminder: "Rappel de vol",
};
const INTRO: Record<Kind, (recipientFirstName: string) => string> = {
  created: (n) => `Bonjour ${n}, ta réservation a bien été enregistrée.`,
  cancelled: (n) => `Bonjour ${n}, cette réservation a été annulée.`,
  reminder: (n) => `Bonjour ${n}, petit rappel : ce vol a lieu demain.`,
};

// Envoie l'email (création, annulation ou rappel) à tous les concernés par
// une réservation : l'élève, l'instructeur, et pour un vol découverte le
// client (pas de compte, juste son email). Chacun ne reçoit qu'une fois
// même s'il apparaît à plusieurs titres. Best-effort — ne fait jamais
// échouer l'appelant.
export async function notifyReservation(reservation: ReservationWithRelations, kind: Kind) {
  const settings = await prisma.schoolSettings.findUnique({ where: { id: "singleton" } });
  const enabled =
    kind === "created"
      ? (settings?.notifyOnReservationCreated ?? true)
      : kind === "cancelled"
      ? (settings?.notifyOnReservationCancelled ?? true)
      : (settings?.notifyReminderEnabled ?? true);
  if (!enabled) return;

  const recipients = new Map<string, string>(); // email -> prénom
  if (reservation.student) recipients.set(reservation.student.email, reservation.student.firstName);
  if (reservation.instructor) recipients.set(reservation.instructor.email, reservation.instructor.firstName);
  if (reservation.type === "DISCOVERY" && reservation.clientEmail) {
    recipients.set(reservation.clientEmail, reservation.clientName?.split(" ")[0] ?? "");
  }
  if (recipients.size === 0) return;

  const detailsHtml =
    fieldRow("Avion", reservation.aircraft.registration) +
    fieldRow("Type", TYPE_LABELS[reservation.type] ?? reservation.type) +
    fieldRow("Départ", formatDateTime(reservation.startTime)) +
    fieldRow("Fin prévue", formatDateTime(reservation.endTime)) +
    (reservation.notes ? fieldRow("Notes", reservation.notes) : "");

  const appUrl = process.env.AUTH_URL || "https://dtoalpinesflight.com";

  await Promise.all(
    Array.from(recipients.entries()).map(async ([email, firstName]) => {
      const bodyHtml = [h2(HEADING[kind]), p(INTRO[kind](firstName || "")), box(detailsHtml)].join("");
      const html = renderEmailShell({
        bodyHtml,
        ctaText: "Voir le planning",
        ctaUrl: `${appUrl}/planning`,
      });
      const text = `${INTRO[kind](firstName || "")}\n\nAvion : ${reservation.aircraft.registration}\nType : ${
        TYPE_LABELS[reservation.type] ?? reservation.type
      }\nDépart : ${formatDateTime(reservation.startTime)}\nFin prévue : ${formatDateTime(reservation.endTime)}`;

      try {
        await sendMail({ to: [email], subject: `${SUBJECT[kind]} — ${formatDateTime(reservation.startTime)}`, text, html });
      } catch {
        // Silencieux : un email qui échoue ne doit jamais faire échouer l'action déclenchante.
      }
    })
  );
}
