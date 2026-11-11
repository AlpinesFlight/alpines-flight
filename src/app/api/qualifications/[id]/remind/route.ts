import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail, isMailerConfigured } from "@/lib/mailer";
import { composeReminderEmail } from "@/lib/qualifications";
import { canManageSchool } from "@/lib/permissions";
import { kindOf } from "@/lib/qualification-catalog";

type Params = { params: Promise<{ id: string }> };

// Envoie (si SMTP configuré) ou compose (sinon, pour envoi manuel) le mail
// de rappel à la personne concernée ET aux admins ("le responsable").
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const qualification = await prisma.qualification.findUnique({
    where: { id },
    // select plutôt que true : composeReminderEmail n'a besoin que de ces
    // champs — évite d'aller chercher le passwordHash de l'utilisateur.
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      currentValidity: { select: { expiresAt: true } },
    },
  });
  if (!qualification) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "GERANT"] } },
    select: { email: true },
  });
  const recipients = Array.from(new Set([qualification.user.email, ...admins.map((a) => a.email)]));

  // Libellé du catalogue quand il y en a un : c'est celui qu'affiche l'appli.
  const { subject, text } = composeReminderEmail({
    ...qualification,
    label: kindOf(qualification.kind)?.label ?? qualification.label,
  });

  const result = await sendMail({ to: recipients, subject, text });

  if (result.sent) {
    await prisma.qualification.update({
      where: { id },
      data: { lastReminderSentAt: new Date() },
    });
  }

  return NextResponse.json({
    sent: result.sent,
    configured: isMailerConfigured(),
    error: result.error,
    recipients,
    subject,
    text,
  });
}
