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

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
