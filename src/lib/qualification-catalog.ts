// Catalogue des licences/qualifications suivies et règles d'échéance —
// partagé entre le serveur (routes, tableau de bord, impression) et le
// navigateur (LicencesView). Aucune dépendance serveur ici.
//
// Qualification.kind vaut l'une de ces clés (null = qualification hors
// catalogue, libellé libre). L'ordre du tableau est celui des colonnes du
// tableau des échéances.

export type QualificationCategory =
  | "LICENSE"
  | "MEDICAL"
  | "CLASS_RATING"
  | "VARIANT"
  | "ADDITIONAL"
  | "INSTRUCTOR_PRIV"
  | "EXAMINER_PRIV"
  | "OTHER";

export type QualificationKind = {
  key: string;
  label: string;
  short: string; // en-tête de colonne
  category: QualificationCategory;
  // false : pas de date de fin (licence EASA, nuit, TW...) — une validité
  // sans date est alors normale ; true : une validité sans date est signalée
  // "date à renseigner".
  hasExpiry: boolean;
  reminderDays: number;
  variants?: string[];
  variantLabel?: string;
  // Variantes sans date de fin même si la qualification en a une en général
  // (mention linguistique niveau 6).
  permanentVariants?: string[];
  hint?: string;
};

export const QUALIFICATION_KINDS: QualificationKind[] = [
  {
    key: "LICENCE",
    label: "Licence de pilote",
    short: "Licence",
    category: "LICENSE",
    hasExpiry: false,
    reminderDays: 60,
    variants: ["LAPL(A)", "PPL(A)", "CPL(A)", "ATPL(A)", "ULM"],
    variantLabel: "Type",
    hint: "Une licence EASA n'a pas de date de fin : ce sont ses qualifications et le certificat médical qui expirent.",
  },
  {
    key: "MEDICAL",
    label: "Certificat médical",
    short: "Médical",
    category: "MEDICAL",
    hasExpiry: true,
    reminderDays: 60,
    variants: ["Classe 1", "Classe 2", "LAPL"],
    variantLabel: "Classe",
  },
  {
    key: "SEP",
    label: "SEP (terre)",
    short: "SEP",
    category: "CLASS_RATING",
    hasExpiry: true,
    reminderDays: 90,
    hint: "Valable 24 mois. Prorogation par expérience ou contrôle dans les 3 mois avant l'échéance.",
  },
  {
    key: "MEP",
    label: "MEP (terre)",
    short: "MEP",
    category: "CLASS_RATING",
    hasExpiry: true,
    reminderDays: 90,
    hint: "Valable 12 mois.",
  },
  {
    key: "FI",
    label: "Instructeur FI(A)",
    short: "FI",
    category: "INSTRUCTOR_PRIV",
    hasExpiry: true,
    reminderDays: 90,
    hint: "Valable 3 ans.",
  },
  {
    key: "CRI",
    label: "Instructeur CRI(A)",
    short: "CRI",
    category: "INSTRUCTOR_PRIV",
    hasExpiry: true,
    reminderDays: 90,
    hint: "Valable 3 ans.",
  },
  {
    key: "MI",
    label: "Instructeur montagne (MI)",
    short: "MI",
    category: "INSTRUCTOR_PRIV",
    hasExpiry: false,
    reminderDays: 90,
    hint: "Suit la validité du certificat d'instructeur (FI).",
  },
  {
    key: "FE",
    label: "Examinateur FE(A)",
    short: "FE",
    category: "EXAMINER_PRIV",
    hasExpiry: true,
    reminderDays: 90,
  },
  {
    key: "IR",
    label: "Vol aux instruments IR(A)",
    short: "IR",
    category: "ADDITIONAL",
    hasExpiry: true,
    reminderDays: 90,
    hint: "Valable 12 mois.",
  },
  {
    key: "NIGHT",
    label: "Vol de nuit",
    short: "Nuit",
    category: "ADDITIONAL",
    hasExpiry: false,
    reminderDays: 60,
  },
  {
    key: "MOUNTAIN",
    label: "Qualification montagne",
    short: "Montagne",
    category: "ADDITIONAL",
    hasExpiry: true,
    reminderDays: 60,
    variants: ["Roues", "Skis", "Roues et skis"],
    variantLabel: "Surface",
    hint: "Valable 24 mois.",
  },
  {
    key: "TW",
    label: "Train classique (TW)",
    short: "TW",
    category: "VARIANT",
    hasExpiry: false,
    reminderDays: 60,
  },
  {
    key: "LANG_EN",
    label: "Anglais (FCL.055)",
    short: "Anglais",
    category: "ADDITIONAL",
    hasExpiry: true,
    reminderDays: 90,
    variants: ["Niveau 4", "Niveau 5", "Niveau 6"],
    variantLabel: "Niveau",
    permanentVariants: ["Niveau 6"],
    hint: "Niveau 4 : 4 ans · niveau 5 : 6 ans · niveau 6 : sans limite (laisser la date vide).",
  },
  {
    key: "LANG_FR",
    label: "Français (FCL.055)",
    short: "Français",
    category: "ADDITIONAL",
    hasExpiry: true,
    reminderDays: 90,
    variants: ["Niveau 4", "Niveau 5", "Niveau 6"],
    variantLabel: "Niveau",
    permanentVariants: ["Niveau 6"],
    hint: "Niveau 4 : 4 ans · niveau 5 : 6 ans · niveau 6 : sans limite (laisser la date vide).",
  },
  {
    key: "THEORY",
    label: "Examen théorique",
    short: "Théorique",
    category: "OTHER",
    hasExpiry: true,
    reminderDays: 60,
    variants: ["LAPL(A)", "PPL(A)"],
    variantLabel: "Examen",
    hint: "Réussite valable 24 mois pour la délivrance de la licence.",
  },
];

const KIND_BY_KEY = new Map(QUALIFICATION_KINDS.map((k) => [k.key, k]));

export function kindOf(key: string | null | undefined): QualificationKind | null {
  return key ? KIND_BY_KEY.get(key) ?? null : null;
}

export function kindOrder(key: string | null | undefined): number {
  const i = QUALIFICATION_KINDS.findIndex((k) => k.key === key);
  return i < 0 ? QUALIFICATION_KINDS.length : i;
}

// Types de justificatif (PilotDocument.category).
export const DOCUMENT_CATEGORIES = [
  { key: "LICENCE", label: "Licence" },
  { key: "MEDICAL", label: "Certificat médical" },
  { key: "ATTESTATION", label: "Attestation" },
  { key: "LOGBOOK", label: "Carnet de vol" },
  { key: "OTHER", label: "Autre document" },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["key"];

export function documentCategoryLabel(key: string): string {
  return DOCUMENT_CATEGORIES.find((c) => c.key === key)?.label ?? "Document";
}

// Qualifications proposées à cocher quand on ajoute une licence (ce qui est
// inscrit dessus) ou un autre document (attestation de prorogation...) — les
// plus courantes à l'école d'abord, le reste derrière "Plus de choix".
export const RATING_KINDS = ["SEP", "FI", "FE", "NIGHT", "MOUNTAIN", "LANG_EN", "MEP", "CRI", "MI", "IR", "TW", "LANG_FR", "THEORY"];
export const COMMON_RATING_KINDS = ["SEP", "FI", "FE", "NIGHT", "MOUNTAIN", "LANG_EN"];

// ---------- Personnes et qualifications obligatoires ----------

export type PersonGroup = "INSTRUCTOR" | "PILOT" | "STUDENT" | "OTHER";

export type LicencesPersonLike = {
  role: string;
  isPilot: boolean;
  isInstructor: boolean;
};

export function personGroup(p: LicencesPersonLike): PersonGroup {
  if (p.isInstructor || p.role === "INSTRUCTOR") return "INSTRUCTOR";
  if (p.role === "STUDENT") return p.isPilot ? "PILOT" : "STUDENT";
  return "OTHER";
}

export const GROUP_LABEL: Record<PersonGroup, string> = {
  INSTRUCTOR: "Instructeurs",
  PILOT: "Pilotes",
  STUDENT: "Élèves",
  OTHER: "Autres comptes",
};

// Ce qui doit figurer au dossier de chacun — affiché "manquant" sinon.
// Instructeurs : de quoi instruire sur SEP (dossier instructeurs du DTO) ;
// pilotes : licence, médical et SEP (sauf LAPL, sans qualification de classe
// à date) ; élèves : le certificat médical (requis avant le premier solo et à
// tenir dans le dossier de formation).
export function requiredKinds(p: LicencesPersonLike, licenceVariant?: string | null): string[] {
  const group = personGroup(p);
  if (group === "INSTRUCTOR") return ["LICENCE", "MEDICAL", "SEP", "FI"];
  if (group === "PILOT") {
    return /LAPL/i.test(licenceVariant ?? "") ? ["LICENCE", "MEDICAL"] : ["LICENCE", "MEDICAL", "SEP"];
  }
  if (group === "STUDENT") return ["MEDICAL"];
  return [];
}

// ---------- État d'une échéance ----------

export type ValidityState =
  | "expired" // date de fin dépassée
  | "due" // dans la fenêtre de rappel
  | "valid" // valide, échéance plus lointaine
  | "permanent" // valide sans date de fin
  | "dateMissing" // qualification à échéance mais aucune date saisie
  | "pending" // aucune validité en cours, une déclaration attend validation
  | "missing" // obligatoire mais absente
  | "none"; // facultative, sans validité en cours (ou non concerné)

// Du plus préoccupant au moins préoccupant — sert à trier et à résumer.
export const STATE_SEVERITY: ValidityState[] = [
  "expired",
  "missing",
  "dateMissing",
  "due",
  "pending",
  "valid",
  "permanent",
  "none",
];

export const PROBLEM_STATES: ValidityState[] = ["expired", "missing", "dateMissing", "due"];

export function worstState(states: ValidityState[]): ValidityState {
  let worst: ValidityState = "none";
  for (const s of states) {
    if (STATE_SEVERITY.indexOf(s) < STATE_SEVERITY.indexOf(worst)) worst = s;
  }
  return worst;
}

// Jour calendaire (à Paris) en nombre de jours depuis l'epoch — compare des
// dates de fin "AAAA-MM-JJ" sans décalage de fuseau : une qualification
// valable jusqu'au 31 reste valide toute la journée du 31.
function parisDayNumber(date: Date): number {
  const iso = date.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
}

function dateOnlyDayNumber(value: string | Date): number {
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
}

export function daysLeft(expiresAt: string | Date, now: Date = new Date()): number {
  return dateOnlyDayNumber(expiresAt) - parisDayNumber(now);
}

export type ValidityLike = {
  status: string;
  variant: string | null;
  expiresAt: string | Date | null;
};

export type SlotLike = {
  kind: string | null;
  reminderDaysBefore: number;
  current: ValidityLike | null;
  hasPending: boolean;
};

export function slotState(slot: SlotLike, now: Date = new Date()): { state: ValidityState; days: number | null } {
  const kind = kindOf(slot.kind);
  const current = slot.current;
  if (!current) return { state: slot.hasPending ? "pending" : "missing", days: null };
  if (!current.expiresAt) {
    const permanent = !kind || !kind.hasExpiry || (kind.permanentVariants ?? []).includes(current.variant ?? "");
    return { state: permanent ? "permanent" : "dateMissing", days: null };
  }
  const days = daysLeft(current.expiresAt, now);
  if (days < 0) return { state: "expired", days };
  if (days <= slot.reminderDaysBefore) return { state: "due", days };
  return { state: "valid", days };
}

export const STATE_LABEL: Record<ValidityState, string> = {
  expired: "Expirée",
  due: "À renouveler",
  valid: "Valide",
  permanent: "Valide (sans échéance)",
  dateMissing: "Date à renseigner",
  pending: "En attente de validation",
  missing: "Manquante",
  none: "Aucune validité en cours",
};

export function stateDetail(state: ValidityState, days: number | null): string {
  if (state === "expired" && days !== null) return `Expirée depuis ${-days} j`;
  if (state === "due" && days !== null) return days === 0 ? "Expire aujourd'hui" : `Expire dans ${days} j`;
  if (state === "valid" && days !== null) return `Valide (${days} j)`;
  return STATE_LABEL[state];
}
