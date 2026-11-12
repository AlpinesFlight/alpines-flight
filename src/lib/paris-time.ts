// Jours et heures « à Paris », quel que soit le fuseau du runtime : le
// serveur Vercel tourne en UTC (new Date("2026-01-01") y tombe à 1h du matin
// à Paris l'hiver, 2h l'été). Utilisé par l'export comptable et le planning
// du jour du tableau de bord.

function parisOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Minuit à Paris pour un jour "YYYY-MM-DD", en instant absolu.
export function parisDayStart(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  return new Date(utcMidnight.getTime() - parisOffsetMinutes(utcMidnight) * 60_000);
}

// Jour "YYYY-MM-DD" à Paris d'un instant (aujourd'hui par défaut).
export function parisIso(date: Date = new Date()): string {
  return date.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

export function parisToday(): string {
  return parisIso(new Date());
}
