"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { Qualification, QualificationDocument, QualificationType, UserLite } from "@/types/models";
import { formatDate, formatDateTime } from "@/lib/format";
import { canManageSchool } from "@/lib/permissions";
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
} from "lucide-react";
import { clsx } from "clsx";

const TYPE_LABEL: Record<QualificationType, string> = {
  LICENSE: "Licence",
  MEDICAL: "Certificat médical",
  CLASS_RATING: "Qualification de classe",
  VARIANT: "Variante",
  ADDITIONAL: "Qualification additionnelle",
  INSTRUCTOR_PRIV: "Privilège instructeur",
  EXAMINER_PRIV: "Privilège examinateur",
  OTHER: "Autre",
};

type Urgency = "expired" | "due" | "ok" | "none";

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function urgencyOf(q: Qualification): Urgency {
  const days = daysUntil(q.currentDocument?.expiresAt);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= q.reminderDaysBefore) return "due";
  return "ok";
}

const URGENCY_DOT: Record<Urgency, string> = {
  expired: "bg-red-500",
  due: "bg-sunset-500",
  ok: "bg-green-500",
  none: "bg-navy-200",
};
const URGENCY_BADGE: Record<Urgency, string> = {
  expired: "bg-red-100 text-red-600",
  due: "bg-sunset-100 text-sunset-600",
  ok: "bg-green-100 text-green-700",
  none: "bg-navy-100 text-navy-500",
};
function urgencyLabel(urgency: Urgency, days: number | null): string {
  if (urgency === "none") return "Sans échéance";
  if (urgency === "expired") return `Expiré depuis ${Math.abs(days ?? 0)} j`;
  if (urgency === "due") return `Expire dans ${days} j`;
  return `Valide (${days} j)`;
}

export function LicencesView() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const canManage = canManageSchool(session?.user?.role);

  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [people, setPeople] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(
    searchParams.get("person")
  );
  const [showUpload, setShowUpload] = useState<{ qualification: Qualification | null } | null>(
    null
  );

  async function load() {
    setLoading(true);
    try {
      const [quals, students, instructors] = await Promise.all([
        apiFetch<Qualification[]>("/api/qualifications"),
        apiFetch<UserLite[]>("/api/students"),
        apiFetch<UserLite[]>("/api/instructors"),
      ]);
      setQualifications(quals);
      const seen = new Set<string>();
      const merged = [...students, ...instructors].filter((p) =>
        seen.has(p.id) ? false : (seen.add(p.id), true)
      );
      setPeople(merged);
      if (!selectedPersonId && merged.length > 0) setSelectedPersonId(merged[0].id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredPeople = useMemo(() => {
    const q = query.toLowerCase();
    return people.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
  }, [people, query]);

  const qualsByPerson = useMemo(() => {
    const map = new Map<string, Qualification[]>();
    for (const q of qualifications) {
      const arr = map.get(q.userId) ?? [];
      arr.push(q);
      map.set(q.userId, arr);
    }
    return map;
  }, [qualifications]);

  const worstUrgencyByPerson = useMemo(() => {
    const order: Urgency[] = ["expired", "due", "ok", "none"];
    const map = new Map<string, Urgency>();
    for (const [userId, quals] of qualsByPerson) {
      let worst: Urgency = "none";
      for (const q of quals) {
        const u = urgencyOf(q);
        if (order.indexOf(u) < order.indexOf(worst)) worst = u;
      }
      map.set(userId, worst);
    }
    return map;
  }, [qualsByPerson]);

  const pendingDocs = useMemo(
    () =>
      qualifications.flatMap((q) =>
        q.documents.filter((d) => d.status === "PENDING").map((d) => ({ qualification: q, document: d }))
      ),
    [qualifications]
  );

  const selectedPerson = people.find((p) => p.id === selectedPersonId) ?? null;
  const selectedQuals = selectedPersonId ? qualsByPerson.get(selectedPersonId) ?? [] : [];
  const canUpload = canManage || (!!selectedPersonId && selectedPersonId === session?.user?.id);

  return (
    <div className="p-8">
      {canManage && pendingDocs.length > 0 && (
        <div className="mb-6 bg-white rounded-2xl border border-sunset-500/40 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-navy-100 bg-sunset-100/50">
            <Clock size={16} className="text-sunset-600" />
            <h2 className="font-semibold text-navy-900">Documents à valider</h2>
            <span className="text-xs font-semibold bg-sunset-500 text-white px-2 py-0.5 rounded-full">
              {pendingDocs.length}
            </span>
          </div>
          <div className="divide-y divide-navy-100">
            {pendingDocs.map(({ qualification, document }) => (
              <PendingRow
                key={document.id}
                qualification={qualification}
                document={document}
                onDone={load}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden h-fit">
          <div className="p-3 border-b border-navy-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un pilote..."
                className="input pl-8 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-navy-100">
            {filteredPeople.map((p) => {
              const urgency = worstUrgencyByPerson.get(p.id) ?? "none";
              const pendingCount = (qualsByPerson.get(p.id) ?? []).reduce(
                (sum, q) => sum + q.documents.filter((d) => d.status === "PENDING").length,
                0
              );
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPersonId(p.id)}
                  className={clsx(
                    "w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
                    selectedPersonId === p.id ? "bg-navy-50" : "hover:bg-navy-50/60"
                  )}
                >
                  <span className={clsx("w-2 h-2 rounded-full shrink-0", URGENCY_DOT[urgency])} />
                  <span className="text-sm text-navy-800 flex-1 min-w-0 truncate">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-[10px] font-semibold text-navy-400 uppercase shrink-0">
                    {p.role === "STUDENT"
                      ? "Élève"
                      : p.role === "INSTRUCTOR"
                      ? "FI"
                      : p.role === "GERANT"
                      ? "Gérant"
                      : "Admin"}
                  </span>
                  {pendingCount > 0 && (
                    <span className="text-[10px] font-semibold bg-sunset-500 text-white rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
            {!loading && filteredPeople.length === 0 && (
              <p className="px-4 py-6 text-sm text-navy-600 text-center">Aucun pilote trouvé.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
          {selectedPerson ? (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
                <h2 className="font-semibold text-navy-900">
                  {selectedPerson.firstName} {selectedPerson.lastName}
                </h2>
                {canUpload && (
                  <button
                    onClick={() => setShowUpload({ qualification: null })}
                    className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
                  >
                    <Plus size={16} /> Importer un document
                  </button>
                )}
              </div>
              <div className="divide-y divide-navy-100">
                {selectedQuals.length === 0 && (
                  <p className="px-5 py-8 text-sm text-navy-600 text-center">
                    {canUpload
                      ? "Aucune qualification enregistrée pour l'instant."
                      : "Aucune qualification visible."}
                  </p>
                )}
                {selectedQuals.map((q) => (
                  <QualificationCard
                    key={q.id}
                    qualification={q}
                    canManage={canManage}
                    canUpload={canUpload}
                    onImport={() => setShowUpload({ qualification: q })}
                    onChanged={load}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="px-5 py-8 text-sm text-navy-600 text-center">
              Sélectionne un pilote pour voir ses documents.
            </p>
          )}
        </div>
      </div>

      {showUpload && selectedPerson && (
        <UploadDocumentModal
          person={selectedPerson}
          existingQualifications={selectedQuals}
          preselected={showUpload.qualification}
          onClose={() => setShowUpload(null)}
          onUploaded={() => {
            setShowUpload(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PendingRow({
  qualification,
  document,
  onDone,
}: {
  qualification: Qualification;
  document: QualificationDocument;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function act(action: "VALIDATE" | "REJECT") {
    if (action === "REJECT" && !window.confirm("Rejeter ce document ?")) return;
    setBusy(true);
    try {
      await apiFetch(`/api/qualifications/documents/${document.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy-900">
          {qualification.user.firstName} {qualification.user.lastName} — {qualification.label}
        </p>
        <p className="text-xs text-navy-600">
          {document.expiresAt ? `Expire le ${formatDate(document.expiresAt)}` : "Sans échéance"}
          {document.number ? ` · n° ${document.number}` : ""} · importé le{" "}
          {formatDateTime(document.uploadedAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {document.fileName && (
          <a
            href={`/api/qualifications/documents/${document.id}/file`}
            target="_blank"
            rel="noopener noreferrer"
            title="Voir le document"
            className="text-navy-500 hover:text-navy-900"
          >
            <FileText size={16} />
          </a>
        )}
        <button
          onClick={() => act("REJECT")}
          disabled={busy}
          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-100 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
        >
          <Ban size={14} /> Rejeter
        </button>
        <button
          onClick={() => act("VALIDATE")}
          disabled={busy}
          className="flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
        >
          <Check size={14} /> Valider
        </button>
      </div>
    </div>
  );
}

function QualificationCard({
  qualification,
  canManage,
  canUpload,
  onImport,
  onChanged,
}: {
  qualification: Qualification;
  canManage: boolean;
  canUpload: boolean;
  onImport: () => void;
  onChanged: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const urgency = urgencyOf(qualification);
  const days = daysUntil(qualification.currentDocument?.expiresAt);
  const pendingDoc = qualification.documents.find((d) => d.status === "PENDING");
  const history = qualification.documents.filter(
    (d) => d.id !== qualification.currentDocumentId && d.status !== "PENDING"
  );

  async function handleRemind() {
    setSending(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ sent: boolean; configured: boolean; recipients: string[] }>(
        `/api/qualifications/${qualification.id}/remind`,
        { method: "POST" }
      );
      setFeedback(
        res.sent
          ? `Envoyé à ${res.recipients.join(", ")}`
          : res.configured
          ? "Échec de l'envoi"
          : "SMTP non configuré — envoi manuel nécessaire"
      );
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteSlot() {
    if (!window.confirm(`Supprimer entièrement « ${qualification.label} » et son historique ?`)) return;
    await apiFetch(`/api/qualifications/${qualification.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy-900">{qualification.label}</p>
          <p className="text-xs text-navy-500">{TYPE_LABEL[qualification.type]}</p>
        </div>
        <span className={clsx("text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap", URGENCY_BADGE[urgency])}>
          {urgencyLabel(urgency, days)}
        </span>
      </div>

      {qualification.currentDocument ? (
        <div className="mt-2 flex items-center gap-3 text-xs text-navy-600">
          {qualification.currentDocument.number && <span>N° {qualification.currentDocument.number}</span>}
          {qualification.currentDocument.expiresAt && (
            <span>Expire le {formatDate(qualification.currentDocument.expiresAt)}</span>
          )}
          {qualification.currentDocument.fileName && (
            <a
              href={`/api/qualifications/documents/${qualification.currentDocument.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sunset-600 hover:underline"
            >
              <FileText size={12} /> Voir le document
            </a>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-navy-500">Aucun document validé pour l&apos;instant.</p>
      )}

      {pendingDoc && (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-sunset-600">
          <Clock size={12} /> Renouvellement en attente de validation
          {pendingDoc.expiresAt ? ` (expire le ${formatDate(pendingDoc.expiresAt)})` : ""}
        </p>
      )}

      {feedback && <p className="mt-1 text-[11px] text-navy-500">{feedback}</p>}

      <div className="mt-3 flex items-center gap-4 text-xs">
        {canUpload && (
          <button onClick={onImport} className="flex items-center gap-1 text-sunset-600 hover:underline">
            <Plus size={12} /> Importer un renouvellement
          </button>
        )}
        {qualification.currentDocument?.expiresAt && canManage && (
          <button
            onClick={handleRemind}
            disabled={sending}
            className="flex items-center gap-1 text-navy-600 hover:text-navy-900 disabled:opacity-50"
          >
            <Send size={12} /> Relancer
          </button>
        )}
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1 text-navy-600 hover:text-navy-900"
          >
            {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <History size={12} /> Historique ({history.length})
          </button>
        )}
        {canManage && (
          <button
            onClick={handleDeleteSlot}
            className="ml-auto flex items-center gap-1 text-navy-400 hover:text-red-600"
          >
            <Trash2 size={12} /> Supprimer
          </button>
        )}
      </div>

      {showHistory && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-navy-100 pt-2">
          {history
            .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
            .map((d) => (
              <div key={d.id} className="flex items-center justify-between text-[11px] text-navy-600">
                <span>
                  {d.status === "ARCHIVED" ? "Archivé" : d.status === "REJECTED" ? "Rejeté" : d.status}
                  {d.expiresAt ? ` · expirait le ${formatDate(d.expiresAt)}` : ""}
                  {d.number ? ` · n° ${d.number}` : ""} · {formatDate(d.uploadedAt)}
                  {d.rejectionReason ? ` · motif : ${d.rejectionReason}` : ""}
                </span>
                {d.fileName && (
                  <a
                    href={`/api/qualifications/documents/${d.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-navy-500 hover:text-sunset-600"
                  >
                    <FileText size={12} />
                  </a>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function UploadDocumentModal({
  person,
  existingQualifications,
  preselected,
  onClose,
  onUploaded,
}: {
  person: UserLite;
  existingQualifications: Qualification[];
  preselected: Qualification | null;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const NEW_SLOT = "__new__";
  const [qualificationId, setQualificationId] = useState(preselected?.id ?? NEW_SLOT);
  const [type, setType] = useState<QualificationType>(preselected?.type ?? "LICENSE");
  const [label, setLabel] = useState(preselected?.label ?? "");
  const [reminderDaysBefore, setReminderDaysBefore] = useState("45");
  const [number, setNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("userId", person.id);
      if (qualificationId !== NEW_SLOT) {
        form.set("qualificationId", qualificationId);
      } else {
        form.set("type", type);
        form.set("label", label);
        form.set("reminderDaysBefore", reminderDaysBefore);
      }
      if (number) form.set("number", number);
      if (issuedAt) form.set("issuedAt", issuedAt);
      if (expiresAt) form.set("expiresAt", expiresAt);
      if (notes) form.set("notes", notes);
      if (file) form.set("file", file);

      const res = await fetch("/api/qualifications/documents", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ? String(data.error) : `Erreur ${res.status}`);
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">
            Importer un document — {person.firstName} {person.lastName}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <select value={qualificationId} onChange={(e) => setQualificationId(e.target.value)} className="input">
            <option value={NEW_SLOT}>➕ Nouvelle qualification...</option>
            {existingQualifications.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>

          {qualificationId === NEW_SLOT && (
            <>
              <select value={type} onChange={(e) => setType(e.target.value as QualificationType)} className="input">
                {Object.entries(TYPE_LABEL).map(([value, l]) => (
                  <option key={value} value={value}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Libellé (ex: SEP terre, Classe 2, FI(A))"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="input"
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-navy-600">Rappel (jours avant échéance)</span>
                <input
                  type="number"
                  min={1}
                  value={reminderDaysBefore}
                  onChange={(e) => setReminderDaysBefore(e.target.value)}
                  className="input"
                />
              </label>
            </>
          )}

          <input
            placeholder="Numéro (optionnel)"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="input"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Délivré le</span>
              <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Expire le</span>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Fichier (PDF, JPEG, PNG — 10 Mo max)</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>

          <textarea
            placeholder="Notes (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-14"
          />

          <p className="text-xs text-navy-500 -mt-1">
            Ce document restera en attente jusqu&apos;à validation par un administrateur.
          </p>

          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={saving || (qualificationId === NEW_SLOT && !label)}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Envoi..." : "Importer"}
          </button>
        </form>
      </div>
    </div>
  );
}
