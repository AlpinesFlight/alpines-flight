import { sendMail } from "@/lib/mailer";
import { renderEmailShell, p, h2, box, fieldRow } from "@/lib/email-templates";

// Email de bienvenue — identifiants + prise en main rapide. Partagé entre
// la création d'un élève/pilote (POST /api/students) et d'un instructeur
// (POST /api/instructors) : les deux créent un compte de connexion de la
// même façon (mot de passe provisoire compris), donc le même email —
// avant ce partage, seule la route élèves l'envoyait, ce qui a fait
// croire à une panne d'envoi alors que Resend fonctionnait très bien : les
// tout premiers comptes instructeur créés (voir /api/instructors) n'avaient
// simplement jamais eu cet appel.
//
// Best-effort : une erreur d'envoi ne doit jamais faire échouer la
// création du compte (le mot de passe temporaire reste de toute façon
// affiché à l'admin).
export async function sendWelcomeEmail(
  firstName: string,
  email: string,
  plainPassword: string,
  role: "STUDENT" | "INSTRUCTOR" = "STUDENT"
) {
  const appUrl = process.env.AUTH_URL || "https://dtoalpinesflight.com";
  const formationLine =
    role === "INSTRUCTOR"
      ? "— <strong>Formation</strong> : suis et mets à jour la progression de tes élèves après chaque séance."
      : "— <strong>Formation</strong> : ta progression y est mise à jour par tes instructeurs après chaque séance.";

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
        `${formationLine}<br>` +
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
- ${role === "INSTRUCTOR" ? "Formation : suis et mets à jour la progression de tes élèves après chaque séance." : "Formation : ta progression y est mise à jour par tes instructeurs."}
- Licences : dépose tes documents pour être relancé avant leur expiration.`;

  const result = await sendMail({
    to: [email],
    subject: "Bienvenue chez Alpines Flight — tes identifiants",
    text,
    html,
  });
  if (!result.sent) {
    // sendMail ne lève jamais d'exception (voir son implémentation) — sans
    // ce log, un échec d'envoi restait totalement invisible, y compris dans
    // les logs serveur.
    console.error("Email de bienvenue non envoyé :", result.error);
  }
}
