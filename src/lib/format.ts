export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)} h`;
}

// Durée en heures, arrondie à LA MINUTE près. À ne jamais recalculer par
// Math.round((ms / 3_600_000) * 10) / 10 (arrondi à 0.1h = 6 minutes près :
// un vol de 19h00 à 19h45, soit 45 min pile entre 42 et 48, se voyait
// arrondi à 48 min) — utilisé aussi bien pour persister la durée d'un vol
// que pour l'aperçu en direct côté formulaire, afin que les deux
// concordent toujours exactement.
export function durationHours(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000) / 60;
}

// Format "1h30" (heures et minutes) plutôt que décimal — pour la durée
// d'UN vol donné (calculée depuis départ/arrivée à la clôture ou à la
// correction), plus lisible que "1.5h" pour ce qu'on lit comme un chrono.
// Les totaux cumulés (heures totales élève/avion...) restent en décimal
// via formatHours ci-dessus, plus adapté à une somme.
export function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

// timeZone: "Europe/Paris" explicite partout ci-dessous — sans ça,
// toLocale*() prend le fuseau du runtime qui l'exécute : correct dans un
// navigateur en France, mais les fonctions serveur Vercel tournent en UTC
// quelle que soit la région de déploiement, ce qui décalait d'1h ou 2h
// toutes les heures affichées dans les mails (résa, rappels...).
const PARIS_TZ = "Europe/Paris";

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    timeZone: PARIS_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("fr-FR", {
    timeZone: PARIS_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Comparaison de calendrier (année/mois/jour), pas d'intervalle de 24h —
// comparer deux dates dans le fuseau Paris, pas celui du runtime (serveur
// Vercel = UTC, voir le commentaire sur PARIS_TZ plus haut), sans quoi un
// événement de fin de journée (ex. 23h) ressort "demain" vu depuis l'UTC.
export function isSameParisDay(a: Date | string, b: Date | string): boolean {
  const key = (d: Date | string) =>
    (typeof d === "string" ? new Date(d) : d).toLocaleDateString("fr-CA", { timeZone: PARIS_TZ });
  return key(a) === key(b);
}
