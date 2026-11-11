"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { upload } from "@vercel/blob/client";
import { apiFetch } from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/blob";
import {
  LicencesData,
  LicencesPerson,
  PilotDocument,
  QualificationValidity,
} from "@/types/models";
import { formatDate, formatDateTime } from "@/lib/format";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";
import {
  DOCUMENT_CATEGORIES,
  GROUP_LABEL,
  PROBLEM_STATES,
  PersonGroup,
  QUALIFICATION_KINDS,
  ValidityState,
  documentCategoryLabel,
  kindOf,
  personGroup,
  stateDetail,
  worstState,
} from "@/lib/qualification-catalog";
import {
  Plus,
  X,
  Search,
  Send,
  Trash2,
  Check,
  Ban,
  FileText,
  Clock,
  History,
  ChevronDown,
  ChevronRight,
  Pencil,
  RefreshCw,
  Printer,
  Paperclip,
} from "lucide-react";
import { clsx } from "clsx";
import { Line, linesByPerson } from "@/lib/licence-lines";

// "31/03/27" — colonnes étroites du tableau ; les dates de fin sont des
// jours (minuit UTC), lus tels quels.
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

function personName(p: { firstName: string; lastName: string } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName}` : "—";
}

function roleLabel(p: LicencesPerson): string {
  if (p.role === "GERANT") return p.isInstructor ? "Gérant · FI" : "Gérant";
  if (p.role === "ADMIN") return p.isInstructor ? "Admin · FI" : "Admin";
  if (p.role === "INSTRUCTOR") return "Instructeur";
  return p.isPilot ? "Pilote" : "Élève";
}

const STATE_BADGE: Record<ValidityState, string> = {
  expired: "bg-red-100 text-red-600",
  due: "bg-sunset-100 text-sunset-600",
  valid: "bg-green-100 text-green-700",
  permanent: "bg-navy-100 text-navy-700",
  dateMissing: "bg-sunset-100 text-sunset-600",
  pending: "bg-navy-100 text-navy-600",
  missing: "bg-red-100 text-red-600",
  none: "bg-navy-50 text-navy-400",
};

function StateBadge({ state, days }: { state: ValidityState; days: number | null }) {
  return (
    <span
      className={clsx(
        "inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
        STATE_BADGE[state]
      )}
    >
      {stateDetail(state, days)}
    </span>
  );
}

type Filters = { group: "ALL" | PersonGroup; query: string; onlyProblems: boolean };

// ---------- Page ----------

export function LicencesView() {
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role;
  const me = session?.user?.id ?? null;
  const canManage = canManageSchool(role);
  const staffViewer = isInstructorOrAbove(role);

  const [data, setData] = useState<LicencesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"matrix" | "list">("matrix");
  const [filters, setFilters] = useState<Filters>({ group: "ALL", query: "", onlyProblems: false });
  const [openPersonId, setOpenPersonId] = useState<string | null>(searchParams.get("person"));

  // Rechargement après chaque modification : les données restent affichées
  // pendant ce temps (pas de bascule "chargement"), et une réponse arrivée
  // après une plus récente est ignorée.
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    // Attend la session résolue : le rôle décide de ce que renvoie l'API.
    if (sessionStatus === "loading") return;
    let cancelled = false;
    apiFetch<LicencesData>("/api/qualifications")
      .then((fresh) => {
        if (cancelled) return;
        setData(fresh);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur inconnue");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, me, reloadKey]);


  const docsByUser = useMemo(() => {
    const map = new Map<string, PilotDocument[]>();
    for (const d of data?.documents ?? []) map.set(d.userId, [...(map.get(d.userId) ?? []), d]);
    return map;
  }, [data]);

  const linesByUser = useMemo(
    () => linesByPerson(data?.people ?? [], data?.qualifications ?? []),
    [data]
  );

  if (error && !data) {
    return <p className="m-4 md:m-8 text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>;
  }
  if (!data) return <p className="p-4 md:p-8 text-sm text-navy-600">Chargement…</p>;

  const fiche = (person: LicencesPerson) => (
    <PersonFiche
      person={person}
      lines={linesByUser.get(person.id) ?? []}
      documents={docsByUser.get(person.id) ?? []}
      canManage={canManage}
      canDeclare={canManage || person.id === me}
      me={me}
      onChanged={load}
    />
  );

  // Élève/pilote : son seul dossier.
  if (!staffViewer) {
    const self = data.people.find((p) => p.id === me);
    return <div className="p-4 md:p-8">{self ? fiche(self) : null}</div>;
  }

  const openPerson = data.people.find((p) => p.id === openPersonId) ?? null;

  return (
    <div className="p-4 md:p-8 flex flex-col gap-5">
      <Summary people={data.people} linesByUser={linesByUser} />

      {canManage && <PendingPanel data={data} onChanged={load} onOpenPerson={setOpenPersonId} />}

      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-3 border-b border-navy-100">
          <div className="flex items-center bg-navy-50 rounded-lg p-1 gap-1">
            {(
              [
                ["matrix", "Tableau des échéances"],
                ["list", "Par date"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                  tab === key ? "bg-white text-navy-900 shadow-sm" : "text-navy-600 hover:text-navy-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <FiltersBar filters={filters} onChange={setFilters} />
          <a
            href="/licences/print"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-navy-700 hover:text-navy-900 hover:bg-navy-50 rounded-lg px-2.5 py-1.5"
          >
            <Printer size={14} /> Imprimer l&apos;état des validités
          </a>
        </div>
        {tab === "matrix" ? (
          <Matrix people={data.people} linesByUser={linesByUser} filters={filters} onOpenPerson={setOpenPersonId} />
        ) : (
          <DeadlineList people={data.people} linesByUser={linesByUser} filters={filters} onOpenPerson={setOpenPersonId} />
        )}
      </div>

      <Legend />

      {openPerson && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex justify-end" onClick={() => setOpenPersonId(null)}>
          <div
            className="h-full w-full max-w-3xl bg-navy-50 overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 md:px-6 py-3 bg-white border-b border-navy-100">
              <p className="text-sm text-navy-600">Dossier licences &amp; qualifications</p>
              <button
                type="button"
                onClick={() => setOpenPersonId(null)}
                aria-label="Fermer"
                className="text-navy-600 hover:text-navy-900"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 md:p-6">{fiche(openPerson)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Résumé, filtres, légende ----------

function Summary({ people, linesByUser }: { people: LicencesPerson[]; linesByUser: Map<string, Line[]> }) {
  const all = people.flatMap((p) => linesByUser.get(p.id) ?? []);
  const count = (states: ValidityState[]) => all.filter((l) => states.includes(l.state)).length;
  const instructorsWithIssue = people.filter(
    (p) =>
      personGroup(p) === "INSTRUCTOR" &&
      (linesByUser.get(p.id) ?? []).some((l) => ["expired", "missing", "dateMissing"].includes(l.state))
  ).length;
  const cards = [
    { label: "Échéances dépassées", value: count(["expired"]), tone: "text-red-600" },
    { label: "À renouveler bientôt", value: count(["due"]), tone: "text-sunset-600" },
    { label: "Manquantes ou dates à compléter", value: count(["missing", "dateMissing"]), tone: "text-red-600" },
    { label: "Instructeurs avec un dossier incomplet ou expiré", value: instructorsWithIssue, tone: "text-red-600" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-2xl border border-navy-100 px-4 py-3">
          <p className={clsx("text-2xl font-bold leading-tight", c.value > 0 ? c.tone : "text-navy-900")}>{c.value}</p>
          <p className="text-xs text-navy-600">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

function FiltersBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const groups: { key: Filters["group"]; label: string }[] = [
    { key: "ALL", label: "Tous" },
    { key: "INSTRUCTOR", label: "Instructeurs" },
    { key: "PILOT", label: "Pilotes" },
    { key: "STUDENT", label: "Élèves" },
  ];
  return (
    <>
      <div className="relative w-44">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
        <input
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Rechercher…"
          className="input pl-8 py-1.5"
        />
      </div>
      <select
        value={filters.group}
        onChange={(e) => onChange({ ...filters, group: e.target.value as Filters["group"] })}
        className="input py-1.5 w-auto"
        aria-label="Catégorie"
      >
        {groups.map((g) => (
          <option key={g.key} value={g.key}>
            {g.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs font-medium text-navy-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.onlyProblems}
          onChange={(e) => onChange({ ...filters, onlyProblems: e.target.checked })}
          className="accent-sunset-500"
        />
        À traiter seulement
      </label>
    </>
  );
}

function visiblePeople(people: LicencesPerson[], linesByUser: Map<string, Line[]>, filters: Filters) {
  const q = filters.query.trim().toLowerCase();
  return people.filter((p) => {
    if (filters.group !== "ALL" && personGroup(p) !== filters.group) return false;
    if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false;
    if (filters.onlyProblems && !(linesByUser.get(p.id) ?? []).some((l) => PROBLEM_STATES.includes(l.state)))
      return false;
    return true;
  });
}

const GROUP_ORDER: PersonGroup[] = ["INSTRUCTOR", "PILOT", "STUDENT", "OTHER"];

function Legend() {
  const items: { state: ValidityState; text: string }[] = [
    { state: "valid", text: "Valide" },
    { state: "due", text: "À renouveler (dans la période de rappel)" },
    { state: "expired", text: "Échéance dépassée" },
    { state: "missing", text: "Obligatoire et absente du dossier" },
    { state: "dateMissing", text: "Date de fin à renseigner" },
    { state: "permanent", text: "Sans date de fin" },
  ];
  return (
    <div className="text-xs text-navy-600 flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((i) => (
          <span key={i.state} className="flex items-center gap-1.5">
            <span className={clsx("w-3 h-3 rounded", STATE_BADGE[i.state])} />
            {i.text}
          </span>
        ))}
      </div>
      <p>
        Obligatoire au dossier : instructeurs — licence, certificat médical, SEP et FI ; pilotes — licence, certificat
        médical et SEP (sauf LAPL) ; élèves — certificat médical.
      </p>
    </div>
  );
}

// ---------- Tableau des échéances ----------

function MatrixCell({ line }: { line: Line | undefined }) {
  if (!line) return <span className="text-navy-200">—</span>;
  const pendingDot = line.pending.length > 0 && line.state !== "pending" && (
    <Clock size={11} className="inline ml-1 -mt-0.5 text-navy-500" aria-label="Renouvellement en attente" />
  );
  const expiresAt = line.current?.expiresAt;
  switch (line.state) {
    case "expired":
    case "due":
      return (
        <span className={clsx("inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums", STATE_BADGE[line.state])}>
          {shortDate(expiresAt!)}
          {pendingDot}
        </span>
      );
    case "valid":
      return (
        <span className="text-green-700 font-medium tabular-nums">
          {shortDate(expiresAt!)}
          {pendingDot}
        </span>
      );
    case "permanent":
      return (
        <span className="text-navy-700 font-medium">
          ✓{line.current?.variant ? ` ${line.current.variant}` : ""}
          {pendingDot}
        </span>
      );
    case "dateMissing":
      return (
        <span className="inline-block rounded border border-dashed border-sunset-500 text-sunset-600 px-1.5 py-0.5 font-semibold">
          Date ?{pendingDot}
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-navy-600 font-medium">
          <Clock size={12} /> À valider
        </span>
      );
    case "missing":
      return (
        <span className="inline-block rounded border border-dashed border-red-500 text-red-600 px-1.5 py-0.5 font-semibold">
          Manquant
        </span>
      );
    default:
      return <span className="text-navy-200">—</span>;
  }
}

function Matrix({
  people,
  linesByUser,
  filters,
  onOpenPerson,
}: {
  people: LicencesPerson[];
  linesByUser: Map<string, Line[]>;
  filters: Filters;
  onOpenPerson: (id: string) => void;
}) {
  const shown = visiblePeople(people, linesByUser, filters);
  // Colonnes : les qualifications du catalogue présentes chez au moins une
  // personne affichée (ou obligatoires pour elle), dans l'ordre du
  // catalogue ; les qualifications hors catalogue sont regroupées en "Autres".
  const usedKeys = new Set(shown.flatMap((p) => (linesByUser.get(p.id) ?? []).map((l) => l.key)));
  const columns = QUALIFICATION_KINDS.filter((k) => usedKeys.has(k.key));
  const hasOthers = shown.some((p) => (linesByUser.get(p.id) ?? []).some((l) => !l.kind));

  if (shown.length === 0) {
    return <p className="px-5 py-8 text-sm text-navy-600 text-center">Personne ne correspond à ces filtres.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-left text-navy-600 border-b border-navy-100">
            <th className="sticky left-0 z-[1] bg-white px-4 py-2.5 font-medium min-w-44">Nom</th>
            {columns.map((k) => (
              <th key={k.key} title={k.label} className="px-2.5 py-2.5 font-medium whitespace-nowrap">
                {k.short}
              </th>
            ))}
            {hasOthers && <th className="px-2.5 py-2.5 font-medium">Autres</th>}
          </tr>
        </thead>
        <tbody>
          {GROUP_ORDER.map((group) => {
            const rows = shown.filter((p) => personGroup(p) === group);
            if (rows.length === 0) return null;
            return [
              <tr key={`g-${group}`} className="bg-navy-50">
                <td
                  colSpan={columns.length + (hasOthers ? 2 : 1)}
                  className="sticky left-0 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-500"
                >
                  {GROUP_LABEL[group]} ({rows.length})
                </td>
              </tr>,
              ...rows.map((p) => {
                const lines = linesByUser.get(p.id) ?? [];
                const others = lines.filter((l) => !l.kind);
                return (
                  <tr
                    key={p.id}
                    onClick={() => onOpenPerson(p.id)}
                    className="border-b border-navy-100 hover:bg-navy-50/60 cursor-pointer"
                  >
                    <td className="sticky left-0 z-[1] bg-white px-4 py-2">
                      <button
                        type="button"
                        className="text-sm font-medium text-navy-900 hover:text-sunset-600 text-left whitespace-nowrap"
                      >
                        {p.firstName} {p.lastName}
                      </button>
                      <p className="text-[10px] text-navy-400">{roleLabel(p)}</p>
                    </td>
                    {columns.map((k) => (
                      <td key={k.key} className="px-2.5 py-2 whitespace-nowrap">
                        <MatrixCell line={lines.find((l) => l.key === k.key)} />
                      </td>
                    ))}
                    {hasOthers && (
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {others.length > 0 ? (
                          <span
                            title={others.map((o) => o.label).join(", ")}
                            className={clsx(
                              "inline-block rounded px-1.5 py-0.5 font-semibold",
                              STATE_BADGE[worstState(others.map((o) => o.state))]
                            )}
                          >
                            {others.length}
                          </span>
                        ) : (
                          <span className="text-navy-200">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Échéances par date ----------

function DeadlineList({
  people,
  linesByUser,
  filters,
  onOpenPerson,
}: {
  people: LicencesPerson[];
  linesByUser: Map<string, Line[]>;
  filters: Filters;
  onOpenPerson: (id: string) => void;
}) {
  const shown = visiblePeople(people, linesByUser, filters);
  const rows = shown.flatMap((p) => (linesByUser.get(p.id) ?? []).map((line) => ({ person: p, line })));
  const dated = rows
    .filter((r) => r.line.current?.expiresAt && (!filters.onlyProblems || PROBLEM_STATES.includes(r.line.state)))
    .sort((a, b) => a.line.current!.expiresAt!.localeCompare(b.line.current!.expiresAt!));
  const toComplete = rows.filter((r) => r.line.state === "missing" || r.line.state === "dateMissing");

  const row = ({ person, line }: { person: LicencesPerson; line: Line }) => (
    <button
      key={`${person.id}-${line.key}`}
      type="button"
      onClick={() => onOpenPerson(person.id)}
      className="w-full grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[7rem_minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 md:px-5 py-2.5 text-left text-sm hover:bg-navy-50/60"
    >
      <span className="font-semibold tabular-nums text-navy-900">
        {line.current?.expiresAt ? formatDate(line.current.expiresAt) : "—"}
      </span>
      <span className="truncate text-navy-800">
        {person.firstName} {person.lastName}
      </span>
      <span className="col-start-2 sm:col-start-auto truncate text-navy-600">
        {line.label}
        {line.current?.variant ? ` · ${line.current.variant}` : ""}
      </span>
      <span className="col-start-2 sm:col-start-auto">
        <StateBadge state={line.state} days={line.days} />
      </span>
    </button>
  );

  return (
    <div className="divide-y divide-navy-100">
      <div>
        <p className="px-4 md:px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
          Fins de validité, de la plus proche à la plus lointaine
        </p>
        {dated.length === 0 ? (
          <p className="px-5 py-6 text-sm text-navy-600">Aucune échéance.</p>
        ) : (
          <div className="divide-y divide-navy-100">{dated.map(row)}</div>
        )}
      </div>
      {toComplete.length > 0 && (
        <div>
          <p className="px-4 md:px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-red-600">
            À compléter : manquantes ou sans date de fin ({toComplete.length})
          </p>
          <div className="divide-y divide-navy-100">{toComplete.map(row)}</div>
        </div>
      )}
    </div>
  );
}

// ---------- Déclarations à valider (Gérant/Admin) ----------

function PendingPanel({
  data,
  onChanged,
  onOpenPerson,
}: {
  data: LicencesData;
  onChanged: () => void;
  onOpenPerson: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = data.qualifications.flatMap((q) =>
    q.validities.filter((v) => v.status === "PENDING").map((v) => ({ slot: q, validity: v }))
  );
  if (pending.length === 0) return null;
  const peopleById = new Map(data.people.map((p) => [p.id, p]));
  const docsById = new Map(data.documents.map((d) => [d.id, d]));

  async function act(validityId: string, action: "VALIDATE" | "REJECT") {
    let rejectionReason: string | null = null;
    if (action === "REJECT") {
      const reason = window.prompt("Motif du refus (optionnel, visible du pilote) :");
      if (reason === null) return;
      rejectionReason = reason || null;
    }
    setBusy(validityId);
    setError(null);
    try {
      await apiFetch(`/api/qualifications/validities/${validityId}/validate`, {
        method: "POST",
        body: JSON.stringify({ action, rejectionReason }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-sunset-500/40 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-navy-100 bg-sunset-100/50">
        <Clock size={16} className="text-sunset-600" />
        <h2 className="font-semibold text-navy-900">Déclarations à valider</h2>
        <span className="text-xs font-semibold bg-sunset-500 text-white px-2 py-0.5 rounded-full">{pending.length}</span>
      </div>
      {error && <p className="mx-5 mt-3 text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
      <div className="divide-y divide-navy-100">
        {pending.map(({ slot, validity }) => {
          const person = peopleById.get(slot.userId);
          const kind = kindOf(slot.kind);
          return (
            <div key={validity.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenPerson(slot.userId)}
                  className="text-sm font-medium text-navy-900 hover:text-sunset-600 text-left"
                >
                  {personName(person)} — {kind?.label ?? slot.label}
                  {validity.variant ? ` · ${validity.variant}` : ""}
                </button>
                <p className="text-xs text-navy-600">
                  {validity.expiresAt ? `Fin de validité ${formatDate(validity.expiresAt)}` : "Sans date de fin"}
                  {validity.number ? ` · n° ${validity.number}` : ""} · déclarée le {formatDateTime(validity.uploadedAt)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {validity.documentIds.map((id) => {
                    const doc = docsById.get(id);
                    return doc ? <DocumentChip key={id} doc={doc} canOpen /> : null;
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => act(validity.id, "REJECT")}
                  disabled={busy !== null}
                  className="flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-100 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                >
                  <Ban size={14} /> Refuser
                </button>
                <button
                  type="button"
                  onClick={() => act(validity.id, "VALIDATE")}
                  disabled={busy !== null}
                  className="flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                >
                  <Check size={14} /> Valider
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Dossier d'une personne ----------

function DocumentChip({ doc, canOpen }: { doc: PilotDocument; canOpen: boolean }) {
  const label = doc.title || documentCategoryLabel(doc.category);
  const className =
    "inline-flex items-center gap-1 max-w-full min-w-0 rounded-full border border-navy-100 bg-white px-2 py-0.5 text-[11px] font-medium text-navy-700";
  if (!canOpen) {
    return (
      <span className={className} title={doc.fileName}>
        <Paperclip size={11} className="shrink-0" /> <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <a
      href={`/api/qualifications/documents/${doc.id}/file`}
      target="_blank"
      rel="noopener noreferrer"
      title={doc.fileName}
      className={clsx(className, "hover:border-sunset-500 hover:text-sunset-600")}
    >
      <Paperclip size={11} className="shrink-0" /> <span className="truncate">{label}</span>
    </a>
  );
}

type ModalState =
  | { type: "add"; rows: RowDraft[]; mode: JustificationMode }
  | { type: "edit"; line: Line; validity: QualificationValidity }
  | null;

function PersonFiche({
  person,
  lines,
  documents,
  canManage,
  canDeclare,
  me,
  onChanged,
}: {
  person: LicencesPerson;
  lines: Line[];
  documents: PilotDocument[];
  canManage: boolean;
  canDeclare: boolean;
  me: string | null;
  onChanged: () => void;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const docsById = new Map(documents.map((d) => [d.id, d]));
  const canOpen = (doc: PilotDocument) => canManage || doc.userId === me;
  const isSelf = person.id === me;

  function renewRow(line: Line): RowDraft {
    return {
      ...emptyRow(),
      choice: line.kind ? `kind:${line.kind.key}` : `slot:${line.slot!.id}`,
      variant: line.current?.variant ?? "",
      number: line.current?.number ?? "",
    };
  }

  async function remind(line: Line) {
    if (!line.slot) return;
    setFeedback(null);
    try {
      const res = await apiFetch<{ sent: boolean; configured: boolean; recipients: string[] }>(
        `/api/qualifications/${line.slot.id}/remind`,
        { method: "POST" }
      );
      setFeedback(
        res.sent
          ? `Relance envoyée à ${res.recipients.join(", ")}`
          : res.configured
            ? "Échec de l'envoi de la relance."
            : "Envoi d'e-mails non configuré — relance à faire à la main."
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function deleteSlot(line: Line) {
    if (!line.slot) return;
    if (!window.confirm(`Supprimer « ${line.label} » et tout son historique ? Les justificatifs restent au dossier.`))
      return;
    await apiFetch(`/api/qualifications/${line.slot.id}`, { method: "DELETE" });
    onChanged();
  }

  async function deletePending(validity: QualificationValidity) {
    if (!window.confirm("Retirer cette déclaration en attente ?")) return;
    await apiFetch(`/api/qualifications/validities/${validity.id}`, { method: "DELETE" });
    onChanged();
  }

  async function deleteDocument(doc: PilotDocument) {
    const used = doc.validityIds.length;
    const message =
      `Supprimer définitivement le fichier « ${doc.fileName} » ?` +
      (used > 0 ? ` Les qualifications qu'il justifie restent au dossier, sans ce justificatif.` : "");
    if (!window.confirm(message)) return;
    try {
      await apiFetch(`/api/qualifications/documents/${doc.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  const toggleHistory = (key: string) =>
    setOpenHistory((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const validityLabels = (doc: PilotDocument) =>
    lines
      .filter((l) => [l.current, ...l.pending, ...l.history].some((v) => v && doc.validityIds.includes(v.id)))
      .map((l) => l.kind?.short ?? l.label);

  // Même règle que DELETE .../documents/[id] : l'école toujours ; la personne
  // qui l'a importé, tant que rien de ce qu'il justifie n'a été validé.
  const allValidities = lines.flatMap((l) => [l.current, ...l.pending, ...l.history]);
  const canDeleteDocument = (doc: PilotDocument) =>
    canManage ||
    (doc.uploadedById === me &&
      allValidities.every((v) => !v || !doc.validityIds.includes(v.id) || v.status === "PENDING" || v.status === "REJECTED"));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-navy-900">
            {person.firstName} {person.lastName}
          </h2>
          <p className="text-sm text-navy-600">{roleLabel(person)}</p>
        </div>
        {canDeclare && (
          <div className="flex flex-wrap gap-2">
            {canManage && documents.length > 0 && (
              <button
                type="button"
                onClick={() => setModal({ type: "add", rows: [emptyRow()], mode: "existing" })}
                className="flex items-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 text-sm font-semibold px-3.5 py-2 transition-colors"
              >
                <Plus size={16} /> Ajouter une qualification
              </button>
            )}
            <button
              type="button"
              onClick={() => setModal({ type: "add", rows: [], mode: "new" })}
              className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
            >
              <Plus size={16} /> Ajouter un document
            </button>
          </div>
        )}
      </div>

      {isSelf && !canManage && (
        <p className="text-xs text-navy-600 bg-white border border-navy-100 rounded-lg px-3 py-2">
          Ajoute la photo ou le scan de ta licence, de ton certificat médical… et indique ce qu&apos;il justifie, avec
          les dates. L&apos;école vérifie puis valide.
        </p>
      )}

      {feedback && <p className="text-xs text-navy-600 bg-white border border-navy-100 rounded-lg px-3 py-2">{feedback}</p>}

      <section className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <h3 className="px-5 py-3 border-b border-navy-100 font-semibold text-navy-900">Qualifications</h3>
        {lines.length === 0 && (
          <p className="px-5 py-6 text-sm text-navy-600">Rien au dossier pour l&apos;instant.</p>
        )}
        <div className="divide-y divide-navy-100">
          {lines.map((line) => {
            const historyOpen = openHistory.has(line.key);
            return (
              <div key={line.key} className="px-5 py-3">
                <div className="flex flex-col md:flex-row md:items-start gap-x-4 gap-y-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy-900">
                      {line.label}
                      {line.required && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-navy-400">
                          obligatoire
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-navy-600 truncate">
                      {[line.current?.variant, line.current?.number ? `n° ${line.current.number}` : null]
                        .filter(Boolean)
                        .join(" · ") ||
                        (line.current
                          ? ""
                          : line.pending.length > 0
                            ? "Déclaration en attente"
                            : line.history.some((v) => v.status === "REJECTED")
                              ? "Dernière déclaration refusée"
                              : "Rien au dossier")}
                    </p>
                    {line.current && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {line.current.documentIds.length > 0 ? (
                          line.current.documentIds.map((id) => {
                            const doc = docsById.get(id);
                            return doc ? <DocumentChip key={id} doc={doc} canOpen={canOpen(doc)} /> : null;
                          })
                        ) : (
                          <span className="text-[11px] italic text-sunset-600">Sans justificatif</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="md:w-44 shrink-0">
                    <p className="text-sm font-semibold text-navy-900 tabular-nums">
                      {line.current?.expiresAt
                        ? formatDate(line.current.expiresAt)
                        : line.current
                          ? line.state === "permanent"
                            ? "Sans date de fin"
                            : "Date de fin ?"
                          : "—"}
                    </p>
                    <StateBadge state={line.state} days={line.days} />
                  </div>
                  {canDeclare && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => setModal({ type: "add", rows: [renewRow(line)], mode: "new" })}
                        className="flex items-center gap-1 font-semibold text-sunset-600 hover:underline"
                      >
                        {line.current ? <RefreshCw size={12} /> : <Plus size={12} />}
                        {line.current ? "Renouveler" : "Ajouter"}
                      </button>
                      {canManage && line.current && (
                        <button
                          type="button"
                          onClick={() => setModal({ type: "edit", line, validity: line.current! })}
                          className="flex items-center gap-1 text-navy-600 hover:text-navy-900"
                        >
                          <Pencil size={12} /> Modifier
                        </button>
                      )}
                      {canManage && line.slot && line.current?.expiresAt && ["due", "expired"].includes(line.state) && (
                        <button
                          type="button"
                          onClick={() => remind(line)}
                          className="flex items-center gap-1 text-navy-600 hover:text-navy-900"
                        >
                          <Send size={12} /> Relancer
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {line.pending.map((v) => (
                  <div
                    key={v.id}
                    className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-sunset-600"
                  >
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> En attente de validation
                      {v.variant ? ` · ${v.variant}` : ""}
                      {v.expiresAt ? ` · fin ${formatDate(v.expiresAt)}` : ""}
                    </span>
                    {v.documentIds.map((id) => {
                      const doc = docsById.get(id);
                      return doc ? <DocumentChip key={id} doc={doc} canOpen={canOpen(doc)} /> : null;
                    })}
                    {(canManage || v.uploadedById === me) && (
                      <button
                        type="button"
                        onClick={() => deletePending(v)}
                        className="flex items-center gap-1 text-navy-400 hover:text-red-600"
                      >
                        <Trash2 size={12} /> Retirer
                      </button>
                    )}
                  </div>
                ))}

                {(line.history.length > 0 || (canManage && line.slot)) && (
                  <div className="mt-2 flex items-center gap-4 text-[11px]">
                    {line.history.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleHistory(line.key)}
                        className="flex items-center gap-1 text-navy-500 hover:text-navy-900"
                      >
                        {historyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <History size={12} /> Historique ({line.history.length})
                      </button>
                    )}
                    {canManage && line.slot && (
                      <button
                        type="button"
                        onClick={() => deleteSlot(line)}
                        className="ml-auto flex items-center gap-1 text-navy-400 hover:text-red-600"
                      >
                        <Trash2 size={12} /> Supprimer
                      </button>
                    )}
                  </div>
                )}

                {historyOpen && (
                  <div className="mt-2 flex flex-col gap-1 border-t border-navy-100 pt-2">
                    {line.history.map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-navy-600 rounded-lg px-2 py-1 -mx-2 hover:bg-navy-50"
                      >
                        <span className="min-w-0">
                          {v.status === "REJECTED" ? "Refusée" : "Ancienne validité"}
                          {v.variant ? ` · ${v.variant}` : ""}
                          {v.expiresAt ? ` · fin ${formatDate(v.expiresAt)}` : ""}
                          {v.number ? ` · n° ${v.number}` : ""}
                          {v.rejectionReason ? ` · motif : ${v.rejectionReason}` : ""}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {v.documentIds.map((id) => {
                            const doc = docsById.get(id);
                            return doc ? <DocumentChip key={id} doc={doc} canOpen={canOpen(doc)} /> : null;
                          })}
                          {canManage && v.status !== "REJECTED" && (
                            <button
                              type="button"
                              onClick={() => setModal({ type: "edit", line, validity: v })}
                              className="flex items-center gap-1 text-navy-400 hover:text-navy-900"
                            >
                              <Pencil size={11} /> Modifier
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <h3 className="px-5 py-3 border-b border-navy-100 font-semibold text-navy-900">
          Justificatifs <span className="text-sm font-normal text-navy-500">({documents.length})</span>
        </h3>
        {documents.length === 0 && <p className="px-5 py-6 text-sm text-navy-600">Aucun document au dossier.</p>}
        <div className="divide-y divide-navy-100">
          {documents.map((doc) => {
            const covers = validityLabels(doc);
            const deletable = canDeleteDocument(doc);
            return (
              <div key={doc.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <FileText size={18} className="text-navy-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-900 truncate">
                    {doc.title || documentCategoryLabel(doc.category)}
                  </p>
                  <p className="text-[11px] text-navy-500 truncate">
                    {doc.fileName} · {Math.max(1, Math.round(doc.fileSize / 1024))} Ko · ajouté le{" "}
                    {formatDate(doc.uploadedAt)}
                    {doc.uploadedBy ? ` par ${personName(doc.uploadedBy)}` : ""}
                  </p>
                  <p className="text-[11px] text-navy-600 mt-0.5">
                    {covers.length > 0 ? `Justifie : ${[...new Set(covers)].join(", ")}` : "Ne justifie aucune qualification"}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  {canOpen(doc) && (
                    <a
                      href={`/api/qualifications/documents/${doc.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-semibold text-sunset-600 hover:underline"
                    >
                      <FileText size={13} /> Voir
                    </a>
                  )}
                  {deletable && (
                    <button
                      type="button"
                      onClick={() => deleteDocument(doc)}
                      className="flex items-center gap-1 text-navy-400 hover:text-red-600"
                    >
                      <Trash2 size={12} /> Supprimer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {modal?.type === "add" && (
        <AddValiditiesModal
          person={person}
          lines={lines}
          documents={documents}
          canManage={canManage}
          initialRows={modal.rows}
          initialMode={modal.mode}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
      {modal?.type === "edit" && (
        <EditValidityModal
          line={modal.line}
          validity={modal.validity}
          documents={documents}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ---------- Ajout : un justificatif, plusieurs qualifications ----------

type JustificationMode = "new" | "existing" | "none";

type RowDraft = {
  key: string;
  // "kind:SEP" (catalogue), "slot:<id>" (qualification hors catalogue déjà
  // au dossier), "custom" (nouvelle hors catalogue, libellé à saisir) ou "".
  choice: string;
  customLabel: string;
  variant: string;
  number: string;
  issuedAt: string;
  expiresAt: string;
};

let rowSeq = 0;
function emptyRow(): RowDraft {
  rowSeq += 1;
  return { key: `r${rowSeq}`, choice: "", customLabel: "", variant: "", number: "", issuedAt: "", expiresAt: "" };
}

const QUICK_KINDS = ["LICENCE", "MEDICAL", "SEP", "MEP", "FI", "FE", "NIGHT", "MOUNTAIN", "LANG_EN"];

function AddValiditiesModal({
  person,
  lines,
  documents,
  canManage,
  initialRows,
  initialMode,
  onClose,
  onSaved,
}: {
  person: LicencesPerson;
  lines: Line[];
  documents: PilotDocument[];
  canManage: boolean;
  initialRows: RowDraft[];
  initialMode: JustificationMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<JustificationMode>(initialMode);
  const [category, setCategory] = useState<string>("LICENCE");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  // Une ligne ajoutée pour une qualification déjà au dossier reprend sa
  // précision et son n° actuels (une licence garde son n° d'un
  // renouvellement à l'autre) — modifiables.
  function prefillFromCurrent(choice: string): Partial<RowDraft> {
    const line = choice.startsWith("kind:")
      ? lines.find((l) => l.key === choice.slice(5))
      : lines.find((l) => l.slot && `slot:${l.slot.id}` === choice);
    return { variant: line?.current?.variant ?? "", number: line?.current?.number ?? "" };
  }
  const [rows, setRows] = useState<RowDraft[]>(
    initialRows.length > 0
      ? initialRows
      : [{ ...emptyRow(), choice: "kind:LICENCE", ...prefillFromCurrent("kind:LICENCE") }]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const customSlots = lines.filter((l) => l.slot && !l.kind);
  const usedChoices = new Set(rows.map((r) => r.choice));

  function patchRow(key: string, patch: Partial<RowDraft>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function changeCategory(next: string) {
    setCategory(next);
    // Lignes encore vierges : proposées d'après le type de document.
    const untouched = rows.every((r) => !r.variant && !r.number && !r.issuedAt && !r.expiresAt && !r.customLabel);
    const defaults = DOCUMENT_CATEGORIES.find((c) => c.key === next)?.defaultKinds ?? [];
    if (untouched) {
      setRows(defaults.length > 0 ? defaults.map((k) => ({ ...emptyRow(), choice: `kind:${k}` })) : [emptyRow()]);
    }
  }

  function handlePick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`Fichier trop volumineux (${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} Mo max).`);
      return;
    }
    setError(null);
    setFile(f);
  }

  function payloadRows() {
    return rows
      .filter((r) => r.choice)
      .map((r) => ({
        ...(r.choice.startsWith("kind:")
          ? { kind: r.choice.slice(5) }
          : r.choice.startsWith("slot:")
            ? { qualificationId: r.choice.slice(5) }
            : { label: r.customLabel.trim() }),
        variant: r.variant.trim() || null,
        number: r.number.trim() || null,
        issuedAt: r.issuedAt || null,
        expiresAt: r.expiresAt || null,
      }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const filled = rows.filter((r) => r.choice);
    if (filled.length === 0) return setError("Indique au moins une qualification.");
    if (filled.some((r) => r.choice === "custom" && !r.customLabel.trim()))
      return setError("Donne un nom à la qualification « Autre ».");
    if (filled.some((r) => r.issuedAt && r.expiresAt && r.expiresAt < r.issuedAt))
      return setError("Une fin de validité précède sa date de délivrance.");
    if (mode === "new" && !file) return setError("Choisis le fichier à importer.");
    if (mode === "existing" && documentIds.length === 0) return setError("Coche au moins un document du dossier.");

    setSaving(true);
    try {
      if (mode === "new" && file) {
        setProgress(0);
        // Envoi direct du navigateur vers Vercel Blob — contourne la limite
        // de 4,5 Mo sur le corps d'une requête serverless (voir
        // .../documents/blob-upload) ; clientPayload porte le compte
        // concerné, revérifié côté serveur.
        const blob = await upload(`qualification-documents/${Date.now()}-${file.name}`, file, {
          access: "private",
          handleUploadUrl: "/api/qualifications/documents/blob-upload",
          clientPayload: person.id,
          multipart: true,
          onUploadProgress: ({ percentage }) => setProgress(percentage),
        });
        await apiFetch("/api/qualifications/documents", {
          method: "POST",
          body: JSON.stringify({
            userId: person.id,
            category,
            title: title.trim() || null,
            fileName: file.name,
            blobUrl: blob.url,
            validities: payloadRows(),
          }),
        });
      } else {
        await apiFetch("/api/qualifications/validities", {
          method: "POST",
          body: JSON.stringify({
            userId: person.id,
            documentIds: mode === "existing" ? documentIds : [],
            validities: payloadRows(),
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  const modes: { key: JustificationMode; label: string }[] = [
    { key: "new", label: "Nouveau fichier" },
    ...(documents.length > 0 ? [{ key: "existing" as const, label: "Document déjà au dossier" }] : []),
    ...(canManage ? [{ key: "none" as const, label: "Pas encore de justificatif" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-navy-900">
            {person.firstName} {person.lastName} — justificatif et qualifications
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-navy-900">1. Justificatif</h3>
            {modes.length > 1 && (
              <div className="flex flex-wrap items-center bg-navy-50 rounded-lg p-1 gap-1 w-fit">
                {modes.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={mode === m.key}
                    onClick={() => setMode(m.key)}
                    className={clsx(
                      "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                      mode === m.key ? "bg-white text-navy-900 shadow-sm" : "text-navy-600 hover:text-navy-900"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {mode === "new" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-navy-600">Type de document</span>
                  <select value={category} onChange={(e) => changeCategory(e.target.value)} className="input">
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-navy-600">Intitulé (optionnel)</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="ex. Licence — pages qualifications"
                    className="input"
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs font-medium text-navy-600">Fichier (PDF, JPEG, PNG, HEIC, WebP)</span>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                    onChange={(e) => handlePick(e.target.files?.[0])}
                    className="text-sm"
                  />
                </label>
                {progress !== null && <p className="text-xs text-navy-500">Envoi… {Math.round(progress)} %</p>}
              </div>
            )}
            {mode === "existing" && (
              <div className="flex flex-col gap-1.5">
                {documents.map((doc) => (
                  <label
                    key={doc.id}
                    className="flex items-center gap-2.5 rounded-lg border border-navy-100 px-3 py-2 text-sm cursor-pointer hover:bg-navy-50"
                  >
                    <input
                      type="checkbox"
                      checked={documentIds.includes(doc.id)}
                      onChange={(e) =>
                        setDocumentIds((prev) =>
                          e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)
                        )
                      }
                      className="accent-sunset-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-navy-900">{doc.title || documentCategoryLabel(doc.category)}</span>
                      <span className="block text-[11px] text-navy-500 truncate">
                        {doc.fileName} · {formatDate(doc.uploadedAt)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {mode === "none" && (
              <p className="text-xs text-sunset-600 bg-sunset-100/60 rounded-lg px-3 py-2">
                Les dates seront enregistrées sans justificatif, et signalées comme telles jusqu&apos;à ce qu&apos;un
                document y soit relié.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-navy-900">2. Ce qu&apos;il justifie</h3>
              <p className="text-xs text-navy-600">
                Une ligne par qualification portée par ce document — une licence peut justifier à elle seule la
                licence, le SEP, le FI, l&apos;anglais…
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {rows.map((row) => {
                const kind = row.choice.startsWith("kind:") ? kindOf(row.choice.slice(5)) : null;
                return (
                  <div key={row.key} className="rounded-xl border border-navy-100 p-3 flex flex-col gap-2.5">
                    <div className="flex items-start gap-2">
                      <select
                        value={row.choice}
                        onChange={(e) => patchRow(row.key, { choice: e.target.value, ...prefillFromCurrent(e.target.value) })}
                        className="input"
                        aria-label="Qualification"
                      >
                        <option value="">Choisir la qualification…</option>
                        {QUALIFICATION_KINDS.map((k) => (
                          <option key={k.key} value={`kind:${k.key}`}>
                            {k.label}
                          </option>
                        ))}
                        {customSlots.map((l) => (
                          <option key={l.slot!.id} value={`slot:${l.slot!.id}`}>
                            {l.label}
                          </option>
                        ))}
                        <option value="custom">Autre (préciser)…</option>
                      </select>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                          aria-label="Retirer cette ligne"
                          className="mt-2 text-navy-400 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    {row.choice === "custom" && (
                      <input
                        value={row.customLabel}
                        onChange={(e) => patchRow(row.key, { customLabel: e.target.value })}
                        placeholder="Nom de la qualification (ex. Remorquage planeur)"
                        className="input"
                      />
                    )}
                    {row.choice && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-navy-600">{kind?.variantLabel ?? "Précision"}</span>
                          <input
                            value={row.variant}
                            onChange={(e) => patchRow(row.key, { variant: e.target.value })}
                            list={kind?.variants ? `variants-${kind.key}` : undefined}
                            placeholder={kind?.variants?.[0] ?? ""}
                            className="input"
                          />
                          {kind?.variants && (
                            <datalist id={`variants-${kind.key}`}>
                              {kind.variants.map((v) => (
                                <option key={v} value={v} />
                              ))}
                            </datalist>
                          )}
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-navy-600">N° (optionnel)</span>
                          <input
                            value={row.number}
                            onChange={(e) => patchRow(row.key, { number: e.target.value })}
                            className="input"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-navy-600">Délivrée le</span>
                          <input
                            type="date"
                            value={row.issuedAt}
                            onChange={(e) => patchRow(row.key, { issuedAt: e.target.value })}
                            className="input"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-navy-600">
                            {kind && !kind.hasExpiry ? "Fin (si applicable)" : "Fin de validité"}
                          </span>
                          <input
                            type="date"
                            value={row.expiresAt}
                            onChange={(e) => patchRow(row.key, { expiresAt: e.target.value })}
                            className="input"
                          />
                        </label>
                        {kind?.hint && <p className="col-span-2 sm:col-span-4 text-[11px] text-navy-500">{kind.hint}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-navy-600 mr-1">Ajouter :</span>
              {QUICK_KINDS.filter((k) => !usedChoices.has(`kind:${k}`)).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    setRows((prev) => [...prev, { ...emptyRow(), choice: `kind:${k}`, ...prefillFromCurrent(`kind:${k}`) }])
                  }
                  className="rounded-full border border-navy-100 px-2.5 py-1 text-xs font-medium text-navy-700 hover:border-sunset-500 hover:text-sunset-600"
                >
                  + {kindOf(k)!.short}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
                className="rounded-full border border-navy-100 px-2.5 py-1 text-xs font-medium text-navy-700 hover:border-sunset-500 hover:text-sunset-600"
              >
                + Autre…
              </button>
            </div>
          </section>

          {!canManage && (
            <p className="text-xs text-navy-500 -mt-2">
              Ta déclaration restera en attente jusqu&apos;à sa validation par l&apos;école.
            </p>
          )}
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : canManage ? "Enregistrer" : "Envoyer pour validation"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- Correction d'une validité (Gérant/Admin) ----------

function EditValidityModal({
  line,
  validity,
  documents,
  onClose,
  onSaved,
}: {
  line: Line;
  validity: QualificationValidity;
  documents: PilotDocument[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const kind = line.kind;
  const [variant, setVariant] = useState(validity.variant ?? "");
  const [number, setNumber] = useState(validity.number ?? "");
  const [issuedAt, setIssuedAt] = useState(validity.issuedAt?.slice(0, 10) ?? "");
  const [expiresAt, setExpiresAt] = useState(validity.expiresAt?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(validity.notes ?? "");
  const [documentIds, setDocumentIds] = useState<string[]>(validity.documentIds);
  const [reminderDays, setReminderDays] = useState(String(line.slot?.reminderDaysBefore ?? kind?.reminderDays ?? 45));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isCurrent = line.current?.id === validity.id;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (issuedAt && expiresAt && expiresAt < issuedAt) return setError("La fin de validité précède la délivrance.");
    setSaving(true);
    try {
      await apiFetch(`/api/qualifications/validities/${validity.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          variant: variant || null,
          number: number || null,
          issuedAt: issuedAt || null,
          expiresAt: expiresAt || null,
          notes: notes || null,
          documentIds,
        }),
      });
      const days = parseInt(reminderDays, 10);
      if (line.slot && days > 0 && days !== line.slot.reminderDaysBefore) {
        await apiFetch(`/api/qualifications/${line.slot.id}`, {
          method: "PATCH",
          body: JSON.stringify({ reminderDaysBefore: days }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const message = isCurrent
      ? "Supprimer cette validité ? Si une validité plus ancienne existe, elle redevient la validité en cours."
      : "Supprimer cette ancienne validité de l'historique ?";
    if (!window.confirm(message)) return;
    setSaving(true);
    try {
      await apiFetch(`/api/qualifications/validities/${validity.id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">
            {line.label} — {isCurrent ? "validité en cours" : "ancienne validité"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">{kind?.variantLabel ?? "Précision"}</span>
              <input
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                list={kind?.variants ? `edit-variants-${kind.key}` : undefined}
                className="input"
              />
              {kind?.variants && (
                <datalist id={`edit-variants-${kind.key}`}>
                  {kind.variants.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Numéro</span>
              <input value={number} onChange={(e) => setNumber(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Délivrée le</span>
              <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Fin de validité</span>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input" />
            </label>
          </div>
          {kind?.hint && <p className="text-[11px] text-navy-500 -mt-1">{kind.hint}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Notes (optionnel)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-14" />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-navy-600">Justificatifs</span>
            {documents.length === 0 && <p className="text-xs text-navy-500">Aucun document au dossier.</p>}
            {documents.map((doc) => (
              <label key={doc.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={documentIds.includes(doc.id)}
                  onChange={(e) =>
                    setDocumentIds((prev) => (e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)))
                  }
                  className="accent-sunset-500"
                />
                <span className="min-w-0 truncate">
                  {doc.title || documentCategoryLabel(doc.category)}{" "}
                  <span className="text-[11px] text-navy-500">· {doc.fileName}</span>
                </span>
              </label>
            ))}
          </div>
          {isCurrent && line.slot && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Rappel (jours avant l&apos;échéance)</span>
              <input
                type="number"
                min={1}
                max={730}
                value={reminderDays}
                onChange={(e) => setReminderDays(e.target.value)}
                className="input w-28"
              />
            </label>
          )}
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex items-center justify-between gap-3 mt-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1 text-sm text-navy-500 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={14} /> Supprimer
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

