import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Recalcule le statut (UPCOMING / DUE / OVERDUE) de toutes les échéances non
 * soldées (status != DONE) d'un avion, à partir de ses heures/cycles actuels
 * et de la date du jour. Appelé après tout événement qui change les
 * compteurs de l'avion (clôture de vol, correction manuelle des heures) ou
 * la définition d'une échéance elle-même.
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

    if (r.type === "HOURLY" && r.dueAtHours != null) {
      const remaining = r.dueAtHours - aircraft.totalHours;
      status = remaining <= 0 ? "OVERDUE" : remaining <= r.alertBefore ? "DUE" : "UPCOMING";
    } else if (r.type === "CYCLES" && r.dueAtCycles != null) {
      const remaining = r.dueAtCycles - aircraft.totalCycles;
      status = remaining <= 0 ? "OVERDUE" : remaining <= r.alertBefore ? "DUE" : "UPCOMING";
    } else if (r.type === "CALENDAR" && r.dueAtDate) {
      const daysRemaining = (r.dueAtDate.getTime() - now) / 86_400_000;
      status = daysRemaining <= 0 ? "OVERDUE" : daysRemaining <= r.alertBefore ? "DUE" : "UPCOMING";
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

  if (record.intervalHours != null) {
    await db.maintenanceRecord.create({
      data: {
        aircraftId: record.aircraftId,
        label: record.label,
        type: "HOURLY",
        dueAtHours: aircraft.totalHours + record.intervalHours,
        alertBefore: record.alertBefore,
        intervalHours: record.intervalHours,
      },
    });
  } else if (record.intervalCycles != null) {
    await db.maintenanceRecord.create({
      data: {
        aircraftId: record.aircraftId,
        label: record.label,
        type: "CYCLES",
        dueAtCycles: aircraft.totalCycles + record.intervalCycles,
        alertBefore: record.alertBefore,
        intervalCycles: record.intervalCycles,
      },
    });
  } else if (record.intervalDays != null) {
    await db.maintenanceRecord.create({
      data: {
        aircraftId: record.aircraftId,
        label: record.label,
        type: "CALENDAR",
        dueAtDate: new Date(Date.now() + record.intervalDays * 86_400_000),
        alertBefore: record.alertBefore,
        intervalDays: record.intervalDays,
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

function formatDueValue(r: {
  type: string;
  dueAtHours: number | null;
  dueAtDate: Date | null;
  dueAtCycles: number | null;
}): string {
  if (r.type === "HOURLY" && r.dueAtHours != null) return `${r.dueAtHours.toFixed(1)} h cellule`;
  if (r.type === "CYCLES" && r.dueAtCycles != null) return `${r.dueAtCycles} cycles`;
  if (r.type === "CALENDAR" && r.dueAtDate) {
    return r.dueAtDate.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" });
  }
  return "—";
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
