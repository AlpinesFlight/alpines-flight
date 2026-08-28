// Envoi d'e-mail via l'API HTTP de Resend (pas de SMTP) — les connexions
// SMTP sortantes se sont montrées peu fiables en environnement serverless
// (Vercel), symptôme classique documenté par Vercel lui-même
// (vercel.com/kb/guide/serverless-functions-and-smtp) : l'appli créait bien
// les comptes mais aucun email ne partait, sans erreur visible. L'API HTTP
// (HTTPS standard, port 443) ne pose pas ce problème.
//
// Optionnel : n'est actif que si RESEND_API_KEY et MAIL_FROM sont fournis
// dans .env. Sans configuration, isMailerConfigured() renvoie false et
// l'appelant doit se rabattre sur l'affichage du message pour envoi manuel —
// on ne prétend jamais avoir envoyé un e-mail qui ne l'a pas été.

export function isMailerConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  // HTML optionnel — voir src/lib/email-templates.ts pour le gabarit aux
  // couleurs de l'école. `text` reste toujours fourni en parallèle (clients
  // mail qui n'affichent pas le HTML, lecteurs d'écran).
  html?: string;
}

export async function sendMail(message: MailMessage): Promise<{ sent: boolean; error?: string }> {
  if (!isMailerConfigured()) {
    return { sent: false, error: "Resend non configuré (RESEND_API_KEY / MAIL_FROM manquants dans .env)." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `Resend a répondu ${res.status} : ${body.slice(0, 300)}` };
    }

    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
