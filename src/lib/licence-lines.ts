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
