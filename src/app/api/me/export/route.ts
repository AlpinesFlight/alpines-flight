import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Droit d'accès / portabilité (RGPD art. 15 et 20) : chaque compte peut
// exporter la totalité de ses propres données en un clic, en JSON. Jamais
// de fileData binaire ici (photos/scans) — ils restent consultables/
// téléchargeables individuellement depuis les pages où ils apparaissent déjà
// (Licences, Documentation), pour ne pas produire un fichier énorme et peu
// exploitable.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
      studentProfile: true,
      instructorProfile: true,
    },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [
    reservationsAsStudent,
    reservationsAsInstructor,
    flightsAsStudent,
    flightsAsInstructor,
    transactions,
    qualifications,
    enrollments,
    announcementsCreated,
    schoolDocumentsUploaded,
  ] = await Promise.all([
    prisma.reservation.findMany({ where: { studentId: userId }, orderBy: { startTime: "desc" } }),
    prisma.reservation.findMany({ where: { instructorId: userId }, orderBy: { startTime: "desc" } }),
    prisma.flightLog.findMany({ where: { studentId: userId }, include: { stops: true }, orderBy: { date: "desc" } }),
    prisma.flightLog.findMany({ where: { instructorId: userId }, include: { stops: true }, orderBy: { date: "desc" } }),
    prisma.accountTransaction.findMany({ where: { studentId: userId }, orderBy: { createdAt: "desc" } }),
    prisma.qualification.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        label: true,
        reminderDaysBefore: true,
        documents: {
          select: {
            id: true,
            number: true,
            issuedAt: true,
            expiresAt: true,
            status: true,
            fileName: true,
            uploadedAt: true,
          },
        },
      },
    }),
    prisma.enrollment.findMany({
      where: { studentId: userId },
      include: {
        program: { select: { code: true, title: true } },
        progress: true,
        sessions: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.announcement.findMany({
      where: { createdById: userId },
      select: { id: true, title: true, body: true, createdAt: true },
    }),
    prisma.schoolDocument.findMany({
      where: { uploadedById: userId },
      select: { id: true, title: true, category: true, visibility: true, fileName: true, uploadedAt: true },
    }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    note:
      "Export de toutes les données personnelles associées à ce compte (droit d'accès / portabilité — RGPD art. 15 et 20). " +
      "Les fichiers joints (scans de licence/médicale, documents) ne sont pas inclus ici : télécharge-les individuellement " +
      "depuis les pages Licences / Documentation.",
    profile: user,
    reservationsAsStudent,
    reservationsAsInstructor,
    flightsAsStudent,
    flightsAsInstructor,
    accountTransactions: transactions,
    qualifications,
    enrollments,
    announcementsCreated,
    schoolDocumentsUploaded,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mes-donnees-alpines-flight-${userId}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
