import { NextResponse } from "next/server";
import crypto from "crypto";
import { zodErrorMessage } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";
import { z } from "zod";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

const schema = z.object({ email: z.string().email() });

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Demande de réinitialisation de mot de passe — pas de session requise
// (c'est justement pour un compte qui n'arrive plus à se connecter). Ne
// révèle jamais si l'email existe ou non côté réponse (même message dans
// les deux cas) : sinon ce formulaire deviendrait un moyen de vérifier
// quels emails ont un compte sur l'appli. Voir aussi
// POST /api/auth/reset-password pour la suite du parcours.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const genericResponse = NextResponse.json({
    ok: true,
    message: "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.",
  });

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, firstName: true },
  });
  // Ne dit jamais "email introuvable" — voir commentaire ci-dessus.
  if (!user) return genericResponse;

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  await prisma.$transaction([
    // Un seul lien valable à la fois par compte — évite l'accumulation de
    // jetons et la confusion si plusieurs demandes sont faites d'affilée
    // (seul le dernier email reçu fonctionne).
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    }),
  ]);

  const appUrl = process.env.AUTH_URL || "https://dtoalpinesflight.com";
  const resetUrl = `${appUrl}/reinitialiser-mot-de-passe?token=${token}`;
  await sendPasswordResetEmail(user.firstName, user.email, resetUrl);

  return genericResponse;
}
