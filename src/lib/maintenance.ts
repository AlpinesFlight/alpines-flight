import type { Prisma, PrismaClient } from "@prisma/client";

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
