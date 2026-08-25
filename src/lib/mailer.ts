import nodemailer from "nodemailer";

// Envoi d'e-mail optionnel : n'est actif que si des identifiants SMTP sont
// fournis dans .env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM).
// Sans configuration, isMailerConfigured() renvoie false et l'appelant doit
// se rabattre sur l'affichage du message pour envoi manuel — on ne prétend
// jamais avoir envoyé un e-mail qui ne l'a pas été.

export function isMailerConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<{ sent: boolean; error?: string }> {
  if (!isMailerConfigured()) {
    return { sent: false, error: "SMTP non configuré (SMTP_HOST / SMTP_USER / SMTP_PASS manquants dans .env)." };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: message.to.join(", "),
      subject: message.subject,
      text: message.text,
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
