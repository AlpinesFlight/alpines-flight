import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient | PrismaClient;

const STATUS_RANK: Record<"UPCOMING" | "DUE" | "OVERDUE", number> = { UPCOMING: 0, DUE: 1, OVERDUE: 2 };

function fieldStatus(remaining: number, alertBefore: number): "UPCOMING" | "DUE" | "OVERDUE" {
  return remaining <= 0 ? "OVERDUE" : remaining <= alertBefore ? "DUE" : "UPCOMING";
}

/**
 * Recalcule le statut (UPCOMING / DUE / OVERDUE) de toutes les échéances non
 * soldées (status != DONE) d'un avion, à partir de ses heures/cycles actuels
 * et de la date du jour. Appelé après tout événement qui change les
 * compteurs de l'avion (clôture de vol, correction manuelle des heures) ou
 * la définition d'une échéance elle-même.
 *
 * Une échéance peut avoir plusieurs seuils renseignés à la fois (ex: 100h OU
 * 12 mois, au premier des deux — cas réel très courant en maintenance
 * aéronautique) : chaque champ dueAtX non nul est évalué indépendamment, et
 * le statut retenu est le plus urgent des deux (pas seulement celui qui
 * correspond à `type`).
 */
export async function recalcAircraftMaintenanceStatuses(db: Tx, aircraftId: string) {
  const aircraft = await db.aircraft.findUnique({ where: { id: aircraftId } });
  if (!aircraft) return;

  const records = await db.maintenanceRecord.findMany({
    where: { aircraftId, status: { not: "DONE" } },
  });

  const now = Date.now();

  for (const r of records) {
    let status: "UPCOMING" | "DUE" | "OVERDUE" = "UPCOMING";

    if (r.dueAtHours != null) {
      const s = fieldStatus(r.dueAtHours - aircraft.totalHours, r.alertBefore);
      if (STATUS_RANK[s] > STATUS_RANK[status]) status = s;
    }
    if (r.dueAtCycles != null) {
      const s = fieldStatus(r.dueAtCycles - aircraft.totalCycles, r.alertBefore);
      if (STATUS_RANK[s] > STATUS_RANK[status]) status = s;
    }
    if (r.dueAtDate) {
      const daysRemaining = (r.dueAtDate.getTime() - now) / 86_400_000;
      const s = fieldStatus(daysRemaining, r.alertBefore);
      if (STATUS_RANK[s] > STATUS_RANK[status]) status = s;
    }

    if (status !== r.status) {
      await db.maintenanceRecord.update({ where: { id: r.id }, data: { status } });
    }
  }
}

type ClosableRecord = {
  id: string;
  aircraftId: string;
  label: string;
  type: string;
  reference: string | null;
  zone: string | null;
  alertBefore: number;
  intervalHours: number | null;
  intervalDays: number | null;
  intervalCycles: number | null;
};

// Solde une échéance : marque DONE, consigne une entrée de Kardex (au
// compteur actuel de l'avion), et — si un intervalle de renouvellement est
// défini — programme aussitôt la suivante à compteur-actuel + intervalle.
// Partagé entre "marquer fait" (une échéance isolée, Flotte) et la clôture
// d'une MaintenanceVisit (plusieurs échéances d'un coup, Gestion) pour que
// les deux parcours se comportent exactement pareil.
export async function closeMaintenanceRecord(
  db: Tx,
  record: ClosableRecord,
  opts: {
    performedBy?: string | null;
    reference?: string | null;
    description?: string | null;
    createdById: string;
    maintenanceVisitId?: string | null;
  }
) {
  const aircraft = await db.aircraft.findUniqueOrThrow({ where: { id: record.aircraftId } });

  await db.maintenanceRecord.update({
    where: { id: record.id },
    data: { status: "DONE", completedAt: new Date() },
  });

  await db.kardexEntry.create({
    data: {
      aircraftId: record.aircraftId,
      date: new Date(),
      hoursAt: aircraft.totalHours,
      cyclesAt: aircraft.totalCycles,
      category: "VISITE",
      title: record.label,
      description: opts.description ?? null,
      performedBy: opts.performedBy ?? null,
      reference: opts.reference ?? null,
      maintenanceRecordId: record.id,
      maintenanceVisitId: opts.maintenanceVisitId ?? null,
      createdById: opts.createdById,
    },
  });

  // Un seul enregistrement renouvelé, avec TOUS les seuils applicables
  // recalculés (pas un enregistrement par type d'intervalle) — cohérent
  // avec le fait qu'une échéance double (ex: 100h OU 12 mois) doit rester
  // double après renouvellement, pas se scinder en deux échéances séparées.
  if (record.intervalHours != null || record.intervalDays != null || record.intervalCycles != null) {
    await db.maintenanceRecord.create({
      data: {
        aircraftId: record.aircraftId,
        label: record.label,
        reference: record.reference,
        zone: record.zone,
        type: record.type as "HOURLY" | "CALENDAR" | "CYCLES",
        dueAtHours: record.intervalHours != null ? aircraft.totalHours + record.intervalHours : null,
        dueAtCycles: record.intervalCycles != null ? aircraft.totalCycles + record.intervalCycles : null,
        dueAtDate: record.intervalDays != null ? new Date(Date.now() + record.intervalDays * 86_400_000) : null,
        alertBefore: record.alertBefore,
        intervalHours: record.intervalHours,
        intervalDays: record.intervalDays,
        intervalCycles: record.intervalCycles,
      },
    });
  }
}

// ---------- Rappels email (échéances dues/dépassées) ----------
//
// Même logique que findDueQualifications : une échéance est "due pour
// rappel" si son statut est DUE ou OVERDUE (déjà dans la fenêtre d'alerte,
// voir recalcAircraftMaintenanceStatuses) et qu'aucun rappel n'est parti
// récemment, pour ne pas relancer chaque jour tant que rien n'a changé.
const RESEND_AFTER_DAYS = 14;

export async function findDueMaintenanceRecords() {
  const all = await prisma.maintenanceRecord.findMany({
    where: { status: { in: ["DUE", "OVERDUE"] } },
    include: { aircraft: { select: { id: true, registration: true, type: true } } },
    orderBy: [{ status: "asc" }, { dueAtDate: "asc" }],
  });

  const now = Date.now();
  return all.filter((r) => {
    if (!r.lastReminderSentAt) return true;
    const daysSinceLastReminder = (now - r.lastReminderSentAt.getTime()) / 86_400_000;
    return daysSinceLastReminder >= RESEND_AFTER_DAYS;
  });
}

// Une échéance peut avoir plusieurs seuils renseignés (voir
// recalcAircraftMaintenanceStatuses) — on les affiche tous, séparés par "ou"
// ("au premier des deux" est la règle implicite en maintenance aéronautique).
function formatDueValue(r: {
  dueAtHours: number | null;
  dueAtDate: Date | null;
  dueAtCycles: number | null;
}): string {
  const parts: string[] = [];
  if (r.dueAtHours != null) parts.push(`${r.dueAtHours.toFixed(1)} h cellule`);
  if (r.dueAtCycles != null) parts.push(`${r.dueAtCycles} cycles`);
  if (r.dueAtDate) {
    parts.push(r.dueAtDate.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" }));
  }
  return parts.length > 0 ? parts.join(" ou ") : "—";
}

export function composeMaintenanceReminderEmail(r: {
  label: string;
  status: string;
  type: string;
  dueAtHours: number | null;
  dueAtDate: Date | null;
  dueAtCycles: number | null;
  aircraft: { registration: string; type: string };
}) {
  const isOverdue = r.status === "OVERDUE";
  const subject = isOverdue
    ? `[Alpines Flight] Échéance dépassée — ${r.aircraft.registration} — ${r.label}`
    : `[Alpines Flight] Échéance proche — ${r.aircraft.registration} — ${r.label}`;

  const text = `Bonjour,

L'aéronef ${r.aircraft.registration} (${r.aircraft.type}) a une échéance de maintenance ${isOverdue ? "dépassée" : "qui approche"} :

  ${r.label}
  ${isOverdue ? "Échéance dépassée" : "À faire avant"} : ${formatDueValue(r)}

Ouvre une visite pour cet aéronef dans Gestion → Maintenance dès que possible.

Alpines Flight`;

  return { subject, text };
}
