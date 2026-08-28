import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { safeUserSelect } from "@/lib/selects";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";
import { sendMail } from "@/lib/mailer";
import { renderEmailShell, p, h2, box, fieldRow } from "@/lib/email-templates";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Le trombinoscope complet (utile pour les pickers élève/instructeur) est
  // visible de tous les comptes connectés, mais le solde du compte pilote et
  // les données médicales/notes internes sont des informations financières
  // ou sensibles réservées au staff pédagogique (FI et au-dessus) — un élève
  // ne doit pas pouvoir consulter le solde ou le certificat médical d'un
  // autre élève simplement en ouvrant sa page Facturation/Licences.
  const staff = isInstructorOrAbove(session.user.role);

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: {
      ...safeUserSelect,
      studentProfile: staff
        ? true
        : {
            select: {
              id: true,
              userId: true,
              licenseType: true,
              totalHours: true,
              isPilot: true,
              createdAt: true,
              updatedAt: true,
            },
          },
    },
    orderBy: { lastName: "asc" },
  });
  return NextResponse.json(students);
}

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  licenseType: z.string().optional(),
  // true = pilote déjà breveté (affiché "Pilote" plutôt que "Élève" sur la
  // page Élèves) — même rôle système STUDENT dans les deux cas.
  isPilot: z.boolean().optional(),
  // Optionnel : l'admin peut fixer le mot de passe lui-même. Laissé vide,
  // un mot de passe temporaire est généré et renvoyé une fois pour être
  // communiqué à l'élève.
  password: z.string().min(8, "8 caractères minimum").optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const dup = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (dup) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 });

  const { password, ...fields } = parsed.data;
  const tempPassword = password ? null : Math.random().toString(36).slice(-10);
  const passwordHash = await bcrypt.hash(password ?? tempPassword!, 10);

  const user = await prisma.user.create({
    data: {
      ...fields,
      role: "STUDENT",
      passwordHash,
      studentProfile: {
        create: { licenseType: fields.licenseType, isPilot: fields.isPilot ?? false },
      },
    },
    select: { ...safeUserSelect, studentProfile: true },
  });

  await sendWelcomeEmail(user.firstName, user.email, password ?? tempPassword!);

  return NextResponse.json({ user, tempPassword }, { status: 201 });
}

// Email de bienvenue — identifiants + prise en main rapide. Best-effort :
// une erreur d'envoi ne doit jamais faire échouer la création du compte
// (le mot de passe temporaire reste de toute façon affiché à l'admin).
async function sendWelcomeEmail(firstName: string, email: string, plainPassword: string) {
  const appUrl = process.env.AUTH_URL || "https://dtoalpinesflight.com";
  const bodyHtml = [
    h2(`Bienvenue chez Alpines Flight, ${firstName} !`),
    p(
      "Ton compte vient d'être créé sur l'application de gestion de l'école : réservation de vols, suivi de ta formation, compte pilote, licences..."
    ),
    box(fieldRow("Adresse de connexion", appUrl.replace(/^https?:\/\//, "")) + fieldRow("Email", email) + fieldRow("Mot de passe provisoire", plainPassword)),
    p(
      "Pense à changer ce mot de passe dès ta première connexion, depuis le menu en bas à gauche une fois sur l'appli (« Changer mon mot de passe »)."
    ),
    h2("Pour bien démarrer"),
    p(
      "— <strong>Planning</strong> : réserve un avion (et un instructeur si besoin) directement sur le calendrier.<br>" +
        "— <strong>Compte pilote</strong> : suis ton solde et déclare tes versements.<br>" +
        "— <strong>Formation</strong> : ta progression y est mise à jour par tes instructeurs après chaque séance.<br>" +
        "— <strong>Licences</strong> : dépose tes documents (licence, certificat médical...) pour qu'ils soient suivis et que tu reçoives une relance avant leur expiration."
    ),
  ].join("");

  const html = renderEmailShell({
    preheader: "Tes identifiants et un guide pour démarrer sur l'appli Alpines Flight.",
    bodyHtml,
    ctaText: "Se connecter",
    ctaUrl: `${appUrl}/login`,
  });

  const text = `Bienvenue chez Alpines Flight, ${firstName} !

Ton compte vient d'être créé sur l'application de gestion de l'école.

Adresse de connexion : ${appUrl}
Email : ${email}
Mot de passe provisoire : ${plainPassword}

Pense à changer ce mot de passe dès ta première connexion (menu en bas à gauche une fois connecté).

Pour bien démarrer :
- Planning : réserve un avion (et un instructeur si besoin) sur le calendrier.
- Compte pilote : suis ton solde et déclare tes versements.
- Formation : ta progression y est mise à jour par tes instructeurs.
- Licences : dépose tes documents pour être relancé avant leur expiration.`;

  try {
    await sendMail({
      to: [email],
      subject: "Bienvenue chez Alpines Flight — tes identifiants",
      text,
      html,
    });
  } catch {
    // Silencieux : voir commentaire ci-dessus.
  }
}
