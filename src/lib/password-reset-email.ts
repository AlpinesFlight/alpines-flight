import { sendMail } from "@/lib/mailer";
import { renderEmailShell, p, h2 } from "@/lib/email-templates";

// Email envoyé quand un compte demande la réinitialisation de son mot de
// passe (voir POST /api/auth/forgot-password) — le lien contient le jeton
// en clair, jamais stocké tel quel en base (voir PasswordResetToken).
// Best-effort comme les autres emails automatiques : un échec d'envoi ne
// doit jamais faire échouer la requête côté appelant (voir cet appel).
export async function sendPasswordResetEmail(firstName: string, email: string, resetUrl: string) {
  const bodyHtml = [
    h2(`Réinitialisation de mot de passe`),
    p(
      `Bonjour ${firstName}, une demande de réinitialisation de mot de passe a été faite pour ce compte (${email}) sur l'application Alpines Flight.`
    ),
    p("Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien expire dans 1 heure et ne peut être utilisé qu'une seule fois."),
    p(
      "Si tu n'es pas à l'origine de cette demande, ignore simplement cet email — ton mot de passe actuel reste inchangé."
    ),
  ].join("");

  const html = renderEmailShell({
    preheader: "Choisis un nouveau mot de passe pour ton compte Alpines Flight.",
    bodyHtml,
    ctaText: "Choisir un nouveau mot de passe",
    ctaUrl: resetUrl,
  });

  const text = `Réinitialisation de mot de passe

Bonjour ${firstName}, une demande de réinitialisation de mot de passe a été faite pour ce compte (${email}) sur l'application Alpines Flight.

Choisis un nouveau mot de passe ici (lien valable 1 heure, usage unique) :
${resetUrl}

Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe actuel reste inchangé.`;

  const result = await sendMail({
    to: [email],
    subject: "Réinitialisation de ton mot de passe — Alpines Flight",
    text,
    html,
  });
  if (!result.sent) {
    console.error("Email de réinitialisation non envoyé :", result.error);
  }
}
