import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { zodErrorMessage } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Finalise une réinitialisation de mot de passe — voir
// POST /api/auth/forgot-password pour la demande. Pas de session requise
// (même raison : le compte n'arrive justement plus à se connecter). Le
// jeton en clair reçu ici n'est jamais stocké ; seul son hash est comparé
// à celui déjà en base (voir PasswordResetToken.tokenHash) — un accès à la
// base seule ne permettrait donc pas de forger un jeton valide.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const tokenHash = hashToken(parsed.data.token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  const invalidError = NextResponse.json(
    { error: "Ce lien est invalide ou a expiré. Demande-en un nouveau depuis la page de connexion." },
    { status: 400 }
  );
  if (!record || record.usedAt || record.expiresAt < new Date()) return invalidError;

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
