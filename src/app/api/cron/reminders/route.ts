import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { notifyReservation } from "@/lib/reservation-emails";
import { sendMail } from "@/lib/mailer";
import { findDueMaintenanceRecords, composeMaintenanceReminderEmail } from "@/lib/maintenance";

// Déclenché une fois par jour par Vercel Cron (voir vercel.json) — envoie le
// rappel du soir pour tous les vols confirmés prévus le lendemain, puis (voir
// plus bas) les échéances de maintenance DUE/OVERDUE au Gérant/Admin.
//
// Fenêtre calculée en UTC plutôt qu'en tenant compte précisément du fuseau
// Europe/Paris (qui demanderait de gérer heure d'été/hiver) : la frontière
// "lendemain" peut donc être décalée d'une heure ou deux par rapport à
// minuit heure de Paris. Sans conséquence en pratique — aucun vol n'est
// programmé en pleine nuit, donc aucun risque de classer un vol sur le
// mauvais jour.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const startOfDayAfter = new Date(startOfTomorrow.getTime() + 24 * 3600 * 1000);

  const reservations = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      startTime: { gte: startOfTomorrow, lt: startOfDayAfter },
    },
    include: {
      aircraft: { select: safeAircraftSelect },
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
    },
  });

  for (const r of reservations) {
    await notifyReservation(r, "reminder");
  }

  // Échéances de maintenance dues/dépassées — un mail par échéance plutôt
  // qu'un digest groupé, pour rester cohérent avec le rappel qualifications
  // (POST /api/qualifications/[id]/remind) qui procède pareil.
  const dueMaintenance = await findDueMaintenanceRecords();
  let maintenanceEmailsSent = 0;
  if (dueMaintenance.length > 0) {
    const managers = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "GERANT"] } },
      select: { email: true },
    });
    const recipients = managers.map((m) => m.email);

    for (const record of dueMaintenance) {
      const { subject, text } = composeMaintenanceReminderEmail(record);
      const result = await sendMail({ to: recipients, subject, text });
      if (result.sent) {
        await prisma.maintenanceRecord.update({
          where: { id: record.id },
          data: { lastReminderSentAt: new Date() },
        });
        maintenanceEmailsSent++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    count: reservations.length,
    maintenanceDue: dueMaintenance.length,
    maintenanceEmailsSent,
  });
}
