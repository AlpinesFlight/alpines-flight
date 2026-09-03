export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)} h`;
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
