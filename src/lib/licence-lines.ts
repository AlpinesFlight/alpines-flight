// Dossier calculé d'une personne : une ligne par qualification détenue, plus
// une ligne "manquante" par qualification obligatoire absente — commun à la
// rubrique Licences, à son impression et au tableau de bord, pour que tous
// affichent exactement les mêmes états.
import type { LicencesPerson, Qualification, QualificationValidity } from "@/types/models";
import {
  QualificationKind,
  ValidityState,
  kindOf,
  kindOrder,
  requiredKinds,
  slotState,
} from "./qualification-catalog";

export type Line = {
  key: string;
  slot: Qualification | null;
  kind: QualificationKind | null;
  label: string;
  current: QualificationValidity | null;
  pending: QualificationValidity[];
  history: QualificationValidity[];
  state: ValidityState;
  days: number | null;
  required: boolean;
};

export function buildLines(person: LicencesPerson, slots: Qualification[], now: Date = new Date()): Line[] {
  const lines: Line[] = slots.map((slot) => {
    const current = slot.validities.find((v) => v.id === slot.currentValidityId) ?? null;
    const pending = slot.validities.filter((v) => v.status === "PENDING");
    const history = slot.validities.filter((v) => v.id !== slot.currentValidityId && v.status !== "PENDING");
    const kind = kindOf(slot.kind);
    const { state, days } = slotState(
      { kind: slot.kind, reminderDaysBefore: slot.reminderDaysBefore, current, hasPending: pending.length > 0 },
      now
    );
    return {
      key: slot.kind ?? `slot:${slot.id}`,
      slot,
      kind,
      label: kind?.label ?? slot.label,
      current,
      pending,
      history,
      state,
      days,
      required: false,
    };
  });
  const licence = lines.find((l) => l.key === "LICENCE")?.current?.variant ?? null;
  const required = requiredKinds(person, licence);
  // Qualification facultative sans aucune validité en cours ni en attente
  // (seule déclaration refusée, par exemple) : rien à réclamer.
  for (const line of lines) {
    if (line.state === "missing" && !required.includes(line.key)) line.state = "none";
  }
  for (const key of required) {
    const line = lines.find((l) => l.key === key);
    if (line) {
      line.required = true;
    } else {
      const kind = kindOf(key)!;
      lines.push({
        key,
        slot: null,
        kind,
        label: kind.label,
        current: null,
        pending: [],
        history: [],
        state: "missing",
        days: null,
        required: true,
      });
    }
  }
  return lines.sort((a, b) => kindOrder(a.kind?.key) - kindOrder(b.kind?.key) || a.label.localeCompare(b.label));
}

export function linesByPerson(people: LicencesPerson[], slots: Qualification[], now: Date = new Date()) {
  const slotsByUser = new Map<string, Qualification[]>();
  for (const q of slots) slotsByUser.set(q.userId, [...(slotsByUser.get(q.userId) ?? []), q]);
  return new Map(people.map((p) => [p.id, buildLines(p, slotsByUser.get(p.id) ?? [], now)]));
}

// "31/08/2026" — les dates de fin sont des jours (minuit UTC), lus tels quels.
export function formatDay(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

// L'état d'une ligne en une phrase, pour la fiche d'une personne.
export function lineStatusText(line: Line): string {
  const end = line.current?.expiresAt ? formatDay(line.current.expiresAt) : null;
  switch (line.state) {
    case "expired":
      return `Expiré le ${end}`;
    case "due":
      return `À renouveler, fin le ${end}`;
    case "valid":
      return `Valable jusqu'au ${end}`;
    case "permanent":
      return "Sans date de fin";
    case "dateMissing":
      return "Date de fin à saisir";
    case "pending":
      return "Envoyé, à vérifier";
    case "missing":
      return "À fournir";
    default:
      return "Aucune date en cours";
  }
}

export type PersonStatus = "expired" | "due" | "pending" | "incomplete" | "ok";

// Résumé d'une personne en un statut et une phrase — ce que montre la liste,
// le détail restant dans sa fiche.
export function personSummary(lines: Line[]): { status: PersonStatus; text: string } {
  const short = (l: Line) => l.kind?.short ?? l.label;
  const byDate = (a: Line, b: Line) => (a.current?.expiresAt ?? "").localeCompare(b.current?.expiresAt ?? "");
  const expired = lines.filter((l) => l.state === "expired").sort(byDate);
  if (expired.length > 0) {
    const more = expired.length > 1 ? ` (+${expired.length - 1} autre${expired.length > 2 ? "s" : ""})` : "";
    return { status: "expired", text: `${short(expired[0])} expiré le ${formatDay(expired[0].current!.expiresAt!)}${more}` };
  }
  const due = lines.filter((l) => l.state === "due").sort(byDate);
  if (due.length > 0) {
    return { status: "due", text: `${short(due[0])} à renouveler, fin le ${formatDay(due[0].current!.expiresAt!)}` };
  }
  const pending = lines.reduce((n, l) => n + l.pending.length, 0);
  if (pending > 0) return { status: "pending", text: "Document envoyé, à vérifier" };
  const missing = lines.filter((l) => l.state === "missing");
  if (missing.length > 0) return { status: "incomplete", text: `Manque : ${missing.map(short).join(", ")}` };
  const noDate = lines.filter((l) => l.state === "dateMissing");
  if (noDate.length > 0) return { status: "incomplete", text: `Date de fin à saisir : ${noDate.map(short).join(", ")}` };
  const next = lines.filter((l) => l.state === "valid").sort(byDate)[0];
  return { status: "ok", text: next ? `Prochaine échéance : ${short(next)} le ${formatDay(next.current!.expiresAt!)}` : "Aucune échéance" };
}
