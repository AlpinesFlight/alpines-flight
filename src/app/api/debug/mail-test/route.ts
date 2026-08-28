import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendMail, isMailerConfigured } from "@/lib/mailer";

// TEMPORAIRE — diagnostic de l'envoi d'email en production, à retirer une
// fois le problème identifié. Envoie un email de test à l'utilisateur
// connecté et renvoie le résultat exact (au lieu de le laisser invisible
// dans les logs serveur). Accessible à tout compte connecté (visite directe
// de l'URL dans le navigateur, avec la session déjà ouverte).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const envState = {
    RESEND_API_KEY_present: !!process.env.RESEND_API_KEY,
    RESEND_API_KEY_length: process.env.RESEND_API_KEY?.length ?? 0,
    MAIL_FROM: process.env.MAIL_FROM ?? null,
    isMailerConfigured: isMailerConfigured(),
  };

  const result = await sendMail({
    to: [session.user.email!],
    subject: "Diagnostic — test d'envoi",
    text: "Si tu reçois ceci, l'envoi fonctionne en production.",
  });

  return NextResponse.json({ envState, result, sentTo: session.user.email });
}
