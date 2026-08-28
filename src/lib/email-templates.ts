// Gabarit HTML commun à tous les emails automatiques de l'appli — couleurs
// exactes de la charte Alpines Flight (voir src/app/globals.css). Écrit en
// tableaux + styles en ligne uniquement (pas de <style>, pas de flex/grid) :
// c'est la seule façon fiable de s'afficher correctement dans Gmail,
// Outlook, etc. En-tête textuel plutôt qu'un logo image, pour rester lisible
// même chez les clients qui bloquent les images par défaut.

const NAVY_900 = "#0a1e39";
const NAVY_800 = "#0c2448";
const NAVY_600 = "#2c4d74";
const NAVY_100 = "#dbe3ee";
const CREAM_50 = "#fef8ef";
const SUNSET_600 = "#d33d10";
const SUNSET_500 = "#f04818";

export function renderEmailShell(opts: {
  preheader?: string; // texte d'aperçu invisible, affiché par certains clients avant l'ouverture
  bodyHtml: string; // contenu déjà en HTML (utiliser les helpers ci-dessous)
  ctaText?: string;
  ctaUrl?: string;
}): string {
  const { preheader, bodyHtml, ctaText, ctaUrl } = opts;
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${NAVY_100};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY_100};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CREAM_50};border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:${NAVY_800};padding:22px 28px;">
            <span style="font-family:Georgia,serif;font-weight:700;font-size:19px;letter-spacing:0.06em;color:${CREAM_50};">ALPINES FLIGHT</span>
            <div style="font-size:11px;color:${SUNSET_500};letter-spacing:0.04em;margin-top:2px;">ÉCOLE DE PILOTAGE — GAP-TALLARD</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:${NAVY_900};font-size:14px;line-height:1.6;">
            ${bodyHtml}
            ${
              ctaText && ctaUrl
                ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr><td style="border-radius:10px;background:${SUNSET_500};">
                     <a href="${ctaUrl}" style="display:inline-block;padding:12px 22px;font-weight:700;font-size:14px;color:${CREAM_50};text-decoration:none;">${ctaText}</a>
                   </td></tr></table>`
                : ""
            }
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 22px;border-top:1px solid ${NAVY_100};font-size:11.5px;color:${NAVY_600};">
            Alpines Flight — 2 impasse de l'Aéropostale, 05130 Tallard.
            Cet email est envoyé automatiquement par l'application de gestion de l'école.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function p(text: string): string {
  return `<p style="margin:0 0 14px;">${text}</p>`;
}

export function h2(text: string): string {
  return `<p style="margin:0 0 14px;font-weight:700;font-size:16px;color:${NAVY_900};">${text}</p>`;
}

// Encadré discret pour mettre en valeur une information (identifiants,
// détail d'un vol...) — fond légèrement teinté, bordure gauche accent.
export function box(innerHtml: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 14px;"><tr><td style="background:${NAVY_100}55;border-left:3px solid ${SUNSET_500};border-radius:6px;padding:12px 16px;font-size:13.5px;color:${NAVY_900};">${innerHtml}</td></tr></table>`;
}

export function fieldRow(label: string, value: string): string {
  return `<div style="margin:0 0 4px;"><span style="color:${NAVY_600};">${label} :</span> <strong>${value}</strong></div>`;
}

export { SUNSET_600 };
