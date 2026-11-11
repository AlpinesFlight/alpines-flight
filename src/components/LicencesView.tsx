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
import { formatDate } from "@/lib/format";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";
import {
  COMMON_RATING_KINDS,
  GROUP_LABEL,
  PersonGroup,
  QualificationKind,
  RATING_KINDS,
  ValidityState,
  documentCategoryLabel,
  kindOf,
  personGroup,
} from "@/lib/qualification-catalog";
import {
  Line,
  PersonStatus,
  formatDay,
  lineStatusText,
  linesByPerson,
  personSummary,
} from "@/lib/licence-lines";
import {
  Plus,
  X,
  Search,
  Send,
  Trash2,
  Check,
  Ban,
  FileText,
  Pencil,
  RefreshCw,
  Printer,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Upload,
  IdCard,
  HeartPulse,
  Files,
} from "lucide-react";
import { clsx } from "clsx";

// ---------- Présentation ----------

const STATE_TEXT_COLOR: Record<ValidityState, string> = {
  expired: "text-red-600",
  due: "text-sunset-600",
  valid: "text-green-700",
  permanent: "text-navy-700",
  dateMissing: "text-sunset-600",
  pending: "text-navy-600",
  missing: "text-red-600",
  none: "text-navy-400",
};

const STATE_DOT: Record<ValidityState, string> = {
  expired: "bg-red-500",
  due: "bg-sunset-500",
  valid: "bg-green-600",
  permanent: "bg-green-600",
  dateMissing: "bg-sunset-500",
  pending: "bg-navy-300",
  missing: "bg-red-500",
  none: "bg-navy-200",
};

const PERSON_STATUS: Record<PersonStatus, { label: string; className: string }> = {
  expired: { label: "Expiré", className: "bg-red-100 text-red-600" },
  due: { label: "À renouveler", className: "bg-sunset-100 text-sunset-600" },
  pending: { label: "À vérifier", className: "bg-white text-navy-700 border border-navy-200" },
  incomplete: { label: "Incomplet", className: "bg-navy-100 text-navy-700" },
  ok: { label: "À jour", className: "bg-green-100 text-green-700" },
};

function StatusPill({ status }: { status: PersonStatus }) {
  const s = PERSON_STATUS[status];
  return (
    <span className={clsx("shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", s.className)}>
      {s.label}
    </span>
  );
}

function personName(p: { firstName: string; lastName: string } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName}` : "—";
}

function roleLabel(p: LicencesPerson): string {
  if (p.role === "GERANT") return p.isInstructor ? "Gérant · instructeur" : "Gérant";
  if (p.role === "ADMIN") return p.isInstructor ? "Administrateur · instructeur" : "Administrateur";
  if (p.role === "INSTRUCTOR") return "Instructeur";
  return p.isPilot ? "Pilote" : "Élève";
}

const REQUIRED_NOTE: Record<PersonGroup, string | null> = {
  INSTRUCTOR: "À tenir au dossier d'un instructeur : licence, certificat médical, SEP et FI.",
  PILOT: "À tenir au dossier d'un pilote : licence, certificat médical et SEP (sauf licence LAPL).",
  STUDENT: "À tenir au dossier d'un élève : certificat médical.",
  OTHER: null,
};

function validityTitle(line: { label: string }, v: QualificationValidity): string {
  return `${line.label}${v.variant ? ` · ${v.variant}` : ""}${v.expiresAt ? `, jusqu'au ${formatDay(v.expiresAt)}` : ""}`;
}

// ---------- Documents envoyés par les pilotes, à vérifier ----------

type PendingGroup = {
  key: string;
  person: LicencesPerson | undefined;
  doc: PilotDocument | null;
  items: { label: string; validity: QualificationValidity }[];
};

function pendingGroups(data: LicencesData, onlyUserId?: string): PendingGroup[] {
  const people = new Map(data.people.map((p) => [p.id, p]));
  const docs = new Map(data.documents.map((d) => [d.id, d]));
  const groups = new Map<string, PendingGroup>();
  for (const slot of data.qualifications) {
    if (onlyUserId && slot.userId !== onlyUserId) continue;
    for (const v of slot.validities.filter((x) => x.status === "PENDING")) {
      const key = v.documentIds[0] ?? v.id;
      const group = groups.get(key) ?? {
        key,
        person: people.get(slot.userId),
        doc: docs.get(v.documentIds[0] ?? "") ?? null,
        items: [],
      };
      group.items.push({ label: kindOf(slot.kind)?.label ?? slot.label, validity: v });
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}

function PendingBox({
  groups,
  onChanged,
  onOpenPerson,
}: {
  groups: PendingGroup[];
  onChanged: () => void;
  onOpenPerson?: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (groups.length === 0) return null;

  async function decide(group: PendingGroup, action: "VALIDATE" | "REJECT") {
    let rejectionReason: string | null = null;
    if (action === "REJECT") {
      const reason = window.prompt("Pourquoi ce document est-il refusé ? (optionnel, visible du pilote)");
      if (reason === null) return;
      rejectionReason = reason || null;
    }
    setBusy(group.key);
    setError(null);
    try {
      for (const { validity } of group.items) {
        await apiFetch(`/api/qualifications/validities/${validity.id}/validate`, {
          method: "POST",
          body: JSON.stringify({ action, rejectionReason }),
        });
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-sunset-500/40 overflow-hidden">
      <h2 className="px-5 py-3 border-b border-navy-100 bg-sunset-100/40 font-semibold text-navy-900">
        Documents envoyés, à vérifier ({groups.length})
      </h2>
      {error && <p className="mx-5 mt-3 text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
      <div className="divide-y divide-navy-100">
        {groups.map((g) => (
          <div key={g.key} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex-1 min-w-48">
              {onOpenPerson && g.person ? (
                <button
                  type="button"
                  onClick={() => onOpenPerson(g.person!.id)}
                  className="text-sm font-semibold text-navy-900 hover:text-sunset-600"
                >
                  {personName(g.person)}
                </button>
              ) : (
                <p className="text-sm font-semibold text-navy-900">{g.doc ? documentCategoryLabel(g.doc.category) : "Déclaration"}</p>
              )}
              <p className="text-xs text-navy-600">{g.items.map((i) => validityTitle(i, i.validity)).join(" · ")}</p>
            </div>
            <div className="flex items-center gap-2">
              {g.doc && (
                <a
                  href={`/api/qualifications/documents/${g.doc.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold text-navy-700 hover:bg-navy-50 rounded-lg px-2.5 py-1.5"
                >
                  <FileText size={14} /> Voir
                </a>
              )}
              <button
                type="button"
                onClick={() => decide(g, "REJECT")}
                disabled={busy !== null}
                className="flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-100 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
              >
                <Ban size={14} /> Refuser
              </button>
              <button
                type="button"
                onClick={() => decide(g, "VALIDATE")}
                disabled={busy !== null}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
              >
                <Check size={14} /> Valider
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Page ----------

const GROUP_ORDER: PersonGroup[] = ["INSTRUCTOR", "PILOT", "STUDENT", "OTHER"];

export function LicencesView() {
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role;
  const me = session?.user?.id ?? null;
  const canManage = canManageSchool(role);
  const staffViewer = isInstructorOrAbove(role);

  const [data, setData] = useState<LicencesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openPersonId, setOpenPersonId] = useState<string | null>(searchParams.get("person"));

  // Rechargement après chaque modification : les données restent affichées
  // pendant ce temps, et une réponse arrivée après une plus récente est
  // ignorée.
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

  const linesByUser = useMemo(() => linesByPerson(data?.people ?? [], data?.qualifications ?? []), [data]);

  if (error && !data) {
    return <p className="m-4 md:m-8 text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>;
  }
  if (!data) return <p className="p-4 md:p-8 text-sm text-navy-600">Chargement…</p>;

  const fiche = (person: LicencesPerson) => (
    <PersonFiche
      person={person}
      lines={linesByUser.get(person.id) ?? []}
      documents={data.documents.filter((d) => d.userId === person.id)}
      canManage={canManage}
      canDeclare={canManage || person.id === me}
      me={me}
      onChanged={load}
    />
  );

  // Élève/pilote : son seul dossier.
  if (!staffViewer) {
    const self = data.people.find((p) => p.id === me);
    return <div className="p-4 md:p-8 max-w-3xl">{self ? fiche(self) : null}</div>;
  }

  const q = query.trim().toLowerCase();
  const people = data.people.filter((p) => !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
  const urgent = people
    .flatMap((person) =>
      (linesByUser.get(person.id) ?? [])
        .filter((line) => line.state === "expired" || line.state === "due")
        .map((line) => ({ person, line }))
    )
    .sort((a, b) => a.line.current!.expiresAt!.localeCompare(b.line.current!.expiresAt!));
  const openPerson = data.people.find((p) => p.id === openPersonId) ?? null;

  return (
    <div className="p-4 md:p-8 flex flex-col gap-5 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une personne…"
            className="input pl-9"
          />
        </div>
        <a
          href="/licences/print"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900 hover:bg-white rounded-lg px-3 py-2"
        >
          <Printer size={15} /> Imprimer l&apos;état complet
        </a>
      </div>

      {canManage && <PendingBox groups={pendingGroups(data)} onChanged={load} onOpenPerson={setOpenPersonId} />}

      <section className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <h2 className="px-5 py-3 border-b border-navy-100 font-semibold text-navy-900">
          À traiter{urgent.length > 0 && <span className="font-normal text-navy-500"> ({urgent.length})</span>}
        </h2>
        {urgent.length === 0 ? (
          <p className="px-5 py-4 text-sm text-green-700">Aucune échéance dépassée ou proche.</p>
        ) : (
          <div className="divide-y divide-navy-100">
            {urgent.map(({ person, line }) => (
              <button
                key={`${person.id}-${line.key}`}
                type="button"
                onClick={() => setOpenPersonId(person.id)}
                className="w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-2.5 text-left hover:bg-navy-50"
              >
                <span className={clsx("w-2 h-2 rounded-full shrink-0", STATE_DOT[line.state])} />
                <span className="flex-1 min-w-40 text-sm text-navy-900">
                  <span className="font-semibold">{personName(person)}</span>
                  <span className="text-navy-600"> — {line.label}</span>
                </span>
                <span className={clsx("text-sm font-medium whitespace-nowrap", STATE_TEXT_COLOR[line.state])}>
                  {lineStatusText(line)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {GROUP_ORDER.map((group) => {
        const rows = people.filter((p) => personGroup(p) === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
            <h2 className="px-5 py-3 border-b border-navy-100 font-semibold text-navy-900">
              {GROUP_LABEL[group]} <span className="font-normal text-navy-500">({rows.length})</span>
            </h2>
            <div className="divide-y divide-navy-100">
              {rows.map((p) => {
                const summary = personSummary(linesByUser.get(p.id) ?? []);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setOpenPersonId(p.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-navy-50"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-navy-900 truncate">{personName(p)}</span>
                      <span className="block text-xs text-navy-500 truncate">{summary.text}</span>
                    </span>
                    <StatusPill status={summary.status} />
                    <ChevronRight size={16} className="shrink-0 text-navy-300" />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {people.length === 0 && <p className="text-sm text-navy-600">Personne ne correspond à cette recherche.</p>}

      {openPerson && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex justify-end" onClick={() => setOpenPersonId(null)}>
          <div className="h-full w-full max-w-2xl bg-navy-50 overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 md:px-6 py-3 bg-white border-b border-navy-100">
              <p className="text-sm text-navy-600">Licences &amp; qualifications</p>
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

// ---------- Fiche d'une personne ----------

type Preset = { docType: DocType; kinds?: string[]; customLabel?: string };

function presetFor(line: Line | null, person: LicencesPerson): Preset {
  if (!line) return { docType: personGroup(person) === "STUDENT" ? "MEDICAL" : "LICENCE" };
  const key = line.kind?.key;
  if (key === "MEDICAL") return { docType: "MEDICAL" };
  if (key === "LICENCE") return { docType: "LICENCE" };
  if (!key) return { docType: "OTHER", customLabel: line.label };
  if (key === "THEORY") return { docType: "OTHER", kinds: [key] };
  return { docType: "LICENCE", kinds: [key] };
}

function DocumentChip({ doc, canOpen }: { doc: PilotDocument; canOpen: boolean }) {
  const label = documentCategoryLabel(doc.category);
  const className =
    "inline-flex items-center gap-1 max-w-full min-w-0 rounded-full border border-navy-100 bg-white px-2 py-0.5 text-xs font-medium text-navy-700";
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

type Modal = { type: "add"; preset: Preset } | { type: "edit"; line: Line; validity: QualificationValidity } | null;

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
  const [modal, setModal] = useState<Modal>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const docsById = new Map(documents.map((d) => [d.id, d]));
  const canOpen = (doc: PilotDocument) => canManage || doc.userId === me;
  const isSelf = person.id === me;
  const allValidities = lines.flatMap((l) => [l.current, ...l.pending, ...l.history]);
  const requiredNote = REQUIRED_NOTE[personGroup(person)];

  // Même règle que DELETE .../documents/[id] : l'école toujours ; la personne
  // qui l'a envoyé, tant que rien de ce qu'il justifie n'a été validé.
  const canDeleteDocument = (doc: PilotDocument) =>
    canManage ||
    (doc.uploadedById === me &&
      allValidities.every(
        (v) => !v || !doc.validityIds.includes(v.id) || v.status === "PENDING" || v.status === "REJECTED"
      ));

  // Ce que le document justifie, sans répéter ce que dit déjà son type
  // (une licence justifie la licence, un certificat médical le médical).
  const covers = (doc: PilotDocument) => [
    ...new Set(
      lines
        .filter((l) => [l.current, ...l.pending, ...l.history].some((v) => v && doc.validityIds.includes(v.id)))
        .filter((l) => l.kind?.key !== doc.category)
        .map((l) => l.kind?.short ?? l.label)
    ),
  ];

  async function run(action: () => Promise<unknown>, success?: string) {
    setFeedback(null);
    try {
      await action();
      if (success) setFeedback(success);
      onChanged();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function remind(line: Line) {
    setFeedback(null);
    try {
      const res = await apiFetch<{ sent: boolean; configured: boolean; recipients: string[] }>(
        `/api/qualifications/${line.slot!.id}/remind`,
        { method: "POST" }
      );
      setFeedback(
        res.sent
          ? `Rappel envoyé par e-mail à ${res.recipients.join(", ")}.`
          : res.configured
            ? "L'envoi du rappel a échoué."
            : "L'envoi d'e-mails n'est pas configuré : rappel à faire à la main."
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-navy-900">{personName(person)}</h2>
          <p className="text-sm text-navy-600">{roleLabel(person)}</p>
        </div>
        {canDeclare && (
          <button
            type="button"
            onClick={() => setModal({ type: "add", preset: presetFor(null, person) })}
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Ajouter un document
          </button>
        )}
      </div>

      {isSelf && !canManage && (
        <p className="text-sm text-navy-700 bg-white border border-navy-100 rounded-xl px-4 py-3">
          Envoie la photo ou le scan de ta licence, de ton certificat médical… avec les dates de fin. L&apos;école
          vérifie, puis c&apos;est enregistré.
        </p>
      )}

      {feedback && (
        <p className="text-sm text-navy-700 bg-white border border-navy-100 rounded-xl px-4 py-3">{feedback}</p>
      )}

      {canManage && <PendingBox groups={pendingGroupsOf(person, lines, docsById)} onChanged={onChanged} />}

      <section className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <h3 className="px-5 py-3 border-b border-navy-100 font-semibold text-navy-900">Qualifications</h3>
        {lines.length === 0 && <p className="px-5 py-5 text-sm text-navy-600">Rien au dossier pour l&apos;instant.</p>}
        <div className="divide-y divide-navy-100">
          {lines.map((line) => (
            <QualificationRow
              key={line.key}
              line={line}
              docsById={docsById}
              canOpen={canOpen}
              canManage={canManage}
              canDeclare={canDeclare}
              me={me}
              onRenew={() => setModal({ type: "add", preset: presetFor(line, person) })}
              onEdit={(validity) => setModal({ type: "edit", line, validity })}
              onRemind={() => remind(line)}
              onDelete={() => {
                if (!window.confirm(`Supprimer « ${line.label} » et tout son historique ? Les documents restent au dossier.`))
                  return;
                run(() => apiFetch(`/api/qualifications/${line.slot!.id}`, { method: "DELETE" }));
              }}
              onWithdraw={(v) => {
                if (!window.confirm("Retirer ce document envoyé ?")) return;
                run(() => apiFetch(`/api/qualifications/validities/${v.id}`, { method: "DELETE" }));
              }}
            />
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <h3 className="px-5 py-3 border-b border-navy-100 font-semibold text-navy-900">
          Documents <span className="font-normal text-navy-500">({documents.length})</span>
        </h3>
        {documents.length === 0 && <p className="px-5 py-5 text-sm text-navy-600">Aucun document au dossier.</p>}
        <div className="divide-y divide-navy-100">
          {documents.map((doc) => {
            const what = covers(doc);
            return (
              <div key={doc.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <FileText size={18} className="text-navy-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-900">
                    {documentCategoryLabel(doc.category)}
                    {what.length > 0 && <span className="font-normal text-navy-600"> — {what.join(", ")}</span>}
                  </p>
                  <p className="text-xs text-navy-500 truncate">
                    {doc.fileName} · ajouté le {formatDate(doc.uploadedAt)}
                    {doc.uploadedBy ? ` par ${personName(doc.uploadedBy)}` : ""}
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
                  {canDeleteDocument(doc) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Supprimer définitivement le fichier « ${doc.fileName} » ?` +
                              (doc.validityIds.length > 0 ? " Les dates qu'il justifie restent au dossier." : "")
                          )
                        )
                          return;
                        run(() => apiFetch(`/api/qualifications/documents/${doc.id}`, { method: "DELETE" }));
                      }}
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

      {requiredNote && <p className="text-xs text-navy-500">{requiredNote}</p>}

      {modal?.type === "add" && (
        <AddDocumentModal
          person={person}
          lines={lines}
          canManage={canManage}
          preset={modal.preset}
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

// Documents envoyés par une personne, regroupés par fichier — même logique
// que pendingGroups, à partir des lignes déjà calculées de sa fiche.
function pendingGroupsOf(person: LicencesPerson, lines: Line[], docsById: Map<string, PilotDocument>): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const line of lines) {
    for (const v of line.pending) {
      const key = v.documentIds[0] ?? v.id;
      const group = groups.get(key) ?? { key, person, doc: docsById.get(v.documentIds[0] ?? "") ?? null, items: [] };
      group.items.push({ label: line.label, validity: v });
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}

function QualificationRow({
  line,
  docsById,
  canOpen,
  canManage,
  canDeclare,
  me,
  onRenew,
  onEdit,
  onRemind,
  onDelete,
  onWithdraw,
}: {
  line: Line;
  docsById: Map<string, PilotDocument>;
  canOpen: (doc: PilotDocument) => boolean;
  canManage: boolean;
  canDeclare: boolean;
  me: string | null;
  onRenew: () => void;
  onEdit: (validity: QualificationValidity) => void;
  onRemind: () => void;
  onDelete: () => void;
  onWithdraw: (validity: QualificationValidity) => void;
}) {
  const [open, setOpen] = useState(false);
  const chips = (v: QualificationValidity) =>
    v.documentIds.length === 0 ? (
      <span className="text-xs italic text-sunset-600">aucun document</span>
    ) : (
      v.documentIds.map((id) => {
        const doc = docsById.get(id);
        return doc ? <DocumentChip key={id} doc={doc} canOpen={canOpen(doc)} /> : null;
      })
    );

  if (line.state === "missing") {
    return (
      <div className="flex items-center gap-3 px-5 py-3">
        <span className={clsx("w-2 h-2 rounded-full shrink-0", STATE_DOT.missing)} />
        <span className="flex-1 min-w-0 text-sm font-semibold text-navy-900">{line.label}</span>
        <span className="text-sm font-medium text-red-600 whitespace-nowrap">À fournir</span>
        {canDeclare && (
          <button
            type="button"
            onClick={onRenew}
            className="flex items-center gap-1 text-xs font-semibold text-sunset-600 hover:underline"
          >
            <Plus size={13} /> Ajouter
          </button>
        )}
      </div>
    );
  }

  const v = line.current;
  const variantLabel = line.kind?.variantLabel ?? "Précision";
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-start sm:items-center gap-3 px-5 py-3 text-left hover:bg-navy-50"
      >
        <span className={clsx("w-2 h-2 rounded-full shrink-0 mt-1.5 sm:mt-0", STATE_DOT[line.state])} />
        {/* Sur téléphone, l'état passe sous l'intitulé plutôt que de le
            compresser sur trois lignes. */}
        <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5">
          <span className="flex-1 min-w-0 text-sm">
            <span className="font-semibold text-navy-900">{line.label}</span>
            {v?.variant && <span className="text-navy-500"> · {v.variant}</span>}
            {line.pending.length > 0 && line.current && (
              <span className="ml-2 text-[11px] font-semibold text-sunset-600 whitespace-nowrap">
                nouveau document à vérifier
              </span>
            )}
          </span>
          <span className={clsx("text-sm font-medium sm:whitespace-nowrap", STATE_TEXT_COLOR[line.state])}>
            {lineStatusText(line)}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={clsx("shrink-0 mt-0.5 sm:mt-0 text-navy-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="px-5 pb-4 pl-10 flex flex-col gap-3 text-sm">
          {v && (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
              <div>
                <dt className="text-xs text-navy-500">Valable jusqu&apos;au</dt>
                <dd className="font-medium text-navy-900">{v.expiresAt ? formatDay(v.expiresAt) : "—"}</dd>
              </div>
              {(line.kind?.variants || v.variant) && (
                <div>
                  <dt className="text-xs text-navy-500">{variantLabel}</dt>
                  <dd className="font-medium text-navy-900">{v.variant ?? "—"}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-navy-500">N°</dt>
                <dd className="font-medium text-navy-900 break-all">{v.number ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-navy-500">Délivré le</dt>
                <dd className="font-medium text-navy-900">{v.issuedAt ? formatDay(v.issuedAt) : "—"}</dd>
              </div>
            </dl>
          )}
          {v && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-navy-500 mr-1">Document :</span>
              {chips(v)}
            </div>
          )}
          {v?.notes && <p className="text-xs text-navy-600">Remarque : {v.notes}</p>}

          {line.pending.map((p) => (
            <div key={p.id} className="rounded-lg bg-sunset-100/40 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium text-sunset-600">
                Envoyé le {formatDate(p.uploadedAt)}, à vérifier
                {p.expiresAt ? ` — jusqu'au ${formatDay(p.expiresAt)}` : ""}
                {p.variant ? ` (${p.variant})` : ""}
              </span>
              {chips(p)}
              {!canManage && p.uploadedById === me && (
                <button
                  type="button"
                  onClick={() => onWithdraw(p)}
                  className="flex items-center gap-1 text-navy-500 hover:text-red-600"
                >
                  <Trash2 size={12} /> Retirer
                </button>
              )}
            </div>
          ))}

          {line.history.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-navy-500 mb-1">Historique</p>
              <ul className="flex flex-col gap-1">
                {line.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-navy-600">
                    <span>
                      {h.status === "REJECTED" ? "Refusé" : h.expiresAt ? `Jusqu'au ${formatDay(h.expiresAt)}` : "Sans date de fin"}
                      {h.variant ? ` · ${h.variant}` : ""}
                      {h.rejectionReason ? ` · motif : ${h.rejectionReason}` : ""}
                    </span>
                    {h.documentIds.map((id) => {
                      const doc = docsById.get(id);
                      return doc ? <DocumentChip key={id} doc={doc} canOpen={canOpen(doc)} /> : null;
                    })}
                    {canManage && h.status !== "REJECTED" && (
                      <button
                        type="button"
                        onClick={() => onEdit(h)}
                        className="text-navy-400 hover:text-navy-900"
                        aria-label="Corriger cette ancienne date"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canDeclare && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onRenew}
                className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-xs font-semibold px-3 py-1.5"
              >
                <RefreshCw size={13} /> {v ? "Renouveler" : "Ajouter"}
              </button>
              {canManage && v && (
                <button
                  type="button"
                  onClick={() => onEdit(v)}
                  className="flex items-center gap-1.5 rounded-lg border border-navy-100 text-navy-700 hover:bg-navy-50 text-xs font-semibold px-3 py-1.5"
                >
                  <Pencil size={13} /> Corriger
                </button>
              )}
              {canManage && line.slot && (line.state === "due" || line.state === "expired") && (
                <button
                  type="button"
                  onClick={onRemind}
                  className="flex items-center gap-1.5 rounded-lg border border-navy-100 text-navy-700 hover:bg-navy-50 text-xs font-semibold px-3 py-1.5"
                >
                  <Send size={13} /> Rappel par e-mail
                </button>
              )}
              {canManage && line.slot && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="ml-auto flex items-center gap-1 text-xs text-navy-400 hover:text-red-600"
                >
                  <Trash2 size={12} /> Supprimer
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Ajout d'un document, guidé selon son type ----------

type DocType = "LICENCE" | "MEDICAL" | "OTHER";
type RatingDraft = { on: boolean; end: string; variant: string };

const DOC_TYPES: { key: DocType; label: string; help: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "LICENCE", label: "Licence", help: "Type, n° et qualifications inscrites (SEP, FI…)", icon: IdCard },
  { key: "MEDICAL", label: "Certificat médical", help: "Classe et date de fin", icon: HeartPulse },
  { key: "OTHER", label: "Autre document", help: "Attestation de prorogation, examen…", icon: Files },
];

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T | "";
  onChange: (v: T | "") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(value === o ? "" : o)}
          className={clsx(
            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            value === o
              ? "border-sunset-500 bg-sunset-500 text-white"
              : "border-navy-100 bg-white text-navy-700 hover:border-navy-300"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// Chemin unique dans le dossier Blob des justificatifs.
function blobPathFor(fileName: string) {
  return `qualification-documents/${Date.now()}-${fileName}`;
}

function needsEndDate(kind: QualificationKind, variant: string) {
  return kind.hasExpiry && !(kind.permanentVariants ?? []).includes(variant);
}

function AddDocumentModal({
  person,
  lines,
  canManage,
  preset,
  onClose,
  onSaved,
}: {
  person: LicencesPerson;
  lines: Line[];
  canManage: boolean;
  preset: Preset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const currentOf = (key: string) => lines.find((l) => l.key === key)?.current ?? null;
  const [docType, setDocType] = useState<DocType>(preset.docType);
  const [file, setFile] = useState<File | null>(null);
  const [licenceVariant, setLicenceVariant] = useState(currentOf("LICENCE")?.variant ?? "");
  const [licenceNumber, setLicenceNumber] = useState(currentOf("LICENCE")?.number ?? "");
  const [medicalVariant, setMedicalVariant] = useState(currentOf("MEDICAL")?.variant ?? "");
  const [medicalEnd, setMedicalEnd] = useState("");
  const [ratings, setRatings] = useState<Record<string, RatingDraft>>(() =>
    Object.fromEntries(
      (preset.kinds ?? []).map((k) => [k, { on: true, end: "", variant: currentOf(k)?.variant ?? "" }])
    )
  );
  const [otherOn, setOtherOn] = useState(!!preset.customLabel);
  const [otherLabel, setOtherLabel] = useState(preset.customLabel ?? "");
  const [otherEnd, setOtherEnd] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const heldKinds = lines.filter((l) => l.current && l.kind).map((l) => l.kind!.key);
  const ratingKinds = RATING_KINDS.filter((k) => docType === "OTHER" || k !== "THEORY");
  const visibleKinds = showAll
    ? ratingKinds
    : ratingKinds.filter((k) => COMMON_RATING_KINDS.includes(k) || heldKinds.includes(k) || ratings[k]?.on);
  const hiddenCount = ratingKinds.length - visibleKinds.length;

  function patchRating(key: string, patch: Partial<RatingDraft>) {
    setRatings((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { on: false, end: "", variant: "" }), ...patch } }));
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`Fichier trop volumineux (${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} Mo max).`);
      return;
    }
    setError(null);
    setFile(f);
  }

  // Ce que le document justifie, au format attendu par l'API.
  function buildValidities(): { validities: object[] } | { error: string } {
    const validities: object[] = [];
    if (docType === "MEDICAL") {
      if (!medicalEnd) return { error: "Indique jusqu'à quand le certificat médical est valable." };
      validities.push({ kind: "MEDICAL", variant: medicalVariant || null, expiresAt: medicalEnd });
      return { validities };
    }
    if (docType === "LICENCE" && licenceVariant) {
      validities.push({ kind: "LICENCE", variant: licenceVariant, number: licenceNumber.trim() || null });
    }
    const missingDates: string[] = [];
    for (const key of ratingKinds) {
      const draft = ratings[key];
      if (!draft?.on) continue;
      const kind = kindOf(key)!;
      if (needsEndDate(kind, draft.variant) && !draft.end) missingDates.push(kind.short);
      validities.push({ kind: key, variant: draft.variant || null, expiresAt: draft.end || null });
    }
    if (docType === "OTHER" && otherOn) {
      if (!otherLabel.trim()) return { error: "Donne un nom à la qualification « Autre »." };
      validities.push({ label: otherLabel.trim(), expiresAt: otherEnd || null });
    }
    if (missingDates.length > 0) return { error: `Indique la date de fin pour : ${missingDates.join(", ")}.` };
    if (validities.length === 0) {
      return {
        error:
          docType === "LICENCE"
            ? "Choisis le type de licence ou coche une qualification inscrite dessus."
            : "Coche ce que justifie ce document.",
      };
    }
    return { validities };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const built = buildValidities();
    if ("error" in built) return setError(built.error);
    if (!file && !canManage) return setError("Ajoute le fichier (photo ou PDF).");

    setSaving(true);
    try {
      if (file) {
        setProgress(0);
        // Envoi direct du navigateur vers Vercel Blob — contourne la limite
        // de 4,5 Mo sur le corps d'une requête serverless (voir
        // .../documents/blob-upload) ; clientPayload porte le compte
        // concerné, revérifié côté serveur.
        const blob = await upload(blobPathFor(file.name), file, {
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
            category: docType,
            fileName: file.name,
            blobUrl: blob.url,
            validities: built.validities,
          }),
        });
      } else {
        await apiFetch("/api/qualifications/validities", {
          method: "POST",
          body: JSON.stringify({ userId: person.id, documentIds: [], validities: built.validities }),
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

  const ratingList = (title: string) => (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-navy-900">{title}</p>
      {visibleKinds.map((key) => {
        const kind = kindOf(key)!;
        const draft = ratings[key] ?? { on: false, end: "", variant: "" };
        const held = currentOf(key);
        return (
          <div
            key={key}
            className={clsx(
              "rounded-xl border px-3 py-2.5",
              draft.on ? "border-sunset-500/60 bg-sunset-100/20" : "border-navy-100"
            )}
          >
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.on}
                onChange={(e) =>
                  patchRating(key, { on: e.target.checked, variant: draft.variant || held?.variant || "" })
                }
                className="w-4 h-4 accent-sunset-500 shrink-0"
              />
              <span className="flex-1 text-sm font-medium text-navy-900">{kind.label}</span>
              {held && (
                <span className="text-[11px] text-navy-500 whitespace-nowrap">
                  au dossier{held.expiresAt ? ` : ${formatDay(held.expiresAt)}` : ""}
                </span>
              )}
            </label>
            {draft.on && (
              <div className="mt-2 pl-7 flex flex-col gap-2">
                {kind.variants && (
                  <Choice options={kind.variants} value={draft.variant} onChange={(variant) => patchRating(key, { variant })} />
                )}
                {needsEndDate(kind, draft.variant) ? (
                  <label className="flex flex-wrap items-center gap-2 text-sm text-navy-700">
                    Valable jusqu&apos;au
                    <input
                      type="date"
                      value={draft.end}
                      onChange={(e) => patchRating(key, { end: e.target.value })}
                      className="input w-auto py-1.5"
                    />
                  </label>
                ) : (
                  <p className="text-xs text-navy-500">Pas de date de fin.</p>
                )}
                {kind.hint && <p className="text-[11px] text-navy-500">{kind.hint}</p>}
              </div>
            )}
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-fit text-xs font-semibold text-sunset-600 hover:underline"
        >
          Plus de choix ({hiddenCount})
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-navy-900">Ajouter un document — {personName(person)}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DOC_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={docType === t.key}
                  onClick={() => setDocType(t.key)}
                  className={clsx(
                    "rounded-xl border px-3 py-3 text-left transition-colors",
                    docType === t.key ? "border-sunset-500 bg-sunset-100/40" : "border-navy-100 hover:border-navy-300"
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                    <Icon size={16} /> {t.label}
                  </span>
                  <span className="block mt-0.5 text-[11px] text-navy-500">{t.help}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-3 rounded-xl border border-dashed border-navy-200 px-4 py-3 cursor-pointer hover:border-sunset-500">
              <Upload size={18} className="text-navy-500 shrink-0" />
              <span className="flex-1 min-w-0 text-sm">
                {file ? (
                  <span className="font-medium text-navy-900 break-all">{file.name}</span>
                ) : (
                  <span className="text-navy-600">Choisir le fichier (photo ou PDF)</span>
                )}
              </span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                onChange={(e) => pickFile(e.target.files?.[0])}
                className="sr-only"
              />
            </label>
            {canManage && !file && (
              <p className="text-[11px] text-navy-500">
                Pas de fichier sous la main ? Tu peux enregistrer les dates sans, et ajouter le document plus tard.
              </p>
            )}
            {progress !== null && <p className="text-xs text-navy-500">Envoi… {Math.round(progress)} %</p>}
          </div>

          {docType === "MEDICAL" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-navy-900">Classe</p>
                <Choice options={kindOf("MEDICAL")!.variants!} value={medicalVariant} onChange={setMedicalVariant} />
              </div>
              <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
                Valable jusqu&apos;au
                <input
                  type="date"
                  value={medicalEnd}
                  onChange={(e) => setMedicalEnd(e.target.value)}
                  className="input w-auto py-1.5"
                />
              </label>
            </div>
          )}

          {docType === "LICENCE" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-navy-900">Type de licence</p>
                <Choice options={kindOf("LICENCE")!.variants!} value={licenceVariant} onChange={setLicenceVariant} />
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-navy-900">N° de licence (optionnel)</span>
                <input
                  value={licenceNumber}
                  onChange={(e) => setLicenceNumber(e.target.value)}
                  placeholder="ex. FRA.FCL.PA00123456"
                  className="input"
                />
              </label>
              {ratingList("Qualifications inscrites sur la licence — coche et indique la date de fin")}
            </div>
          )}

          {docType === "OTHER" && (
            <div className="flex flex-col gap-3">
              {ratingList("Ce document justifie")}
              <div
                className={clsx(
                  "rounded-xl border px-3 py-2.5",
                  otherOn ? "border-sunset-500/60 bg-sunset-100/20" : "border-navy-100"
                )}
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={otherOn}
                    onChange={(e) => setOtherOn(e.target.checked)}
                    className="w-4 h-4 accent-sunset-500 shrink-0"
                  />
                  <span className="flex-1 text-sm font-medium text-navy-900">Autre (à préciser)</span>
                </label>
                {otherOn && (
                  <div className="mt-2 pl-7 flex flex-col gap-2">
                    <input
                      value={otherLabel}
                      onChange={(e) => setOtherLabel(e.target.value)}
                      placeholder="ex. Remorquage planeur"
                      className="input"
                    />
                    <label className="flex flex-wrap items-center gap-2 text-sm text-navy-700">
                      Valable jusqu&apos;au (si applicable)
                      <input
                        type="date"
                        value={otherEnd}
                        onChange={(e) => setOtherEnd(e.target.value)}
                        className="input w-auto py-1.5"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : canManage ? "Enregistrer" : "Envoyer pour vérification"}
            </button>
            {!canManage && (
              <p className="text-[11px] text-navy-500 text-center">L&apos;école vérifie le document avant de l&apos;enregistrer.</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Correction d'une date (Gérant/Admin) ----------

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isCurrent = line.current?.id === validity.id;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (issuedAt && expiresAt && expiresAt < issuedAt) return setError("La date de fin précède la date de délivrance.");
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
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const message = isCurrent
      ? "Supprimer cette date ? Si une date plus ancienne existe, elle redevient la date en cours."
      : "Supprimer cette ancienne date de l'historique ?";
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
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">Corriger — {line.label}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {!isCurrent && <p className="text-xs text-navy-500 -mt-1">Ancienne date, dans l&apos;historique.</p>}
          <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
            Valable jusqu&apos;au
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input w-auto py-1.5" />
          </label>
          {kind?.variants && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-navy-900">{kind.variantLabel}</p>
              <Choice options={kind.variants} value={variant} onChange={setVariant} />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">N° (optionnel)</span>
              <input value={number} onChange={(e) => setNumber(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Délivré le (optionnel)</span>
              <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} className="input" />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-navy-600">Document qui le justifie</p>
            {documents.length === 0 && <p className="text-xs text-navy-500">Aucun document au dossier.</p>}
            {documents.map((doc) => (
              <label key={doc.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={documentIds.includes(doc.id)}
                  onChange={(e) =>
                    setDocumentIds((prev) => (e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)))
                  }
                  className="w-4 h-4 accent-sunset-500"
                />
                <span className="min-w-0 truncate">
                  {documentCategoryLabel(doc.category)} <span className="text-xs text-navy-500">· {doc.fileName}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Remarque (optionnel)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-14" />
          </label>
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1 text-sm text-navy-500 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={14} /> Supprimer cette date
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

