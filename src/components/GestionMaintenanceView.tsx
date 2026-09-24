"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { formatDate, formatHours } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import { Aircraft, MaintenanceRecord, MaintenanceVisit } from "@/types/models";
import {
  Wrench,
  X,
  Plus,
  FileText,
  Upload,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "À venir",
  DUE: "Proche",
  OVERDUE: "Dépassée",
  DONE: "Soldée",
};
const STATUS_STYLE: Record<string, string> = {
  UPCOMING: "bg-navy-700 text-navy-100/70",
  DUE: "bg-sunset-500/15 text-sunset-500",
  OVERDUE: "bg-red-500/15 text-red-400",
  DONE: "bg-green-500/15 text-green-400",
};

function dueSummary(r: MaintenanceRecord): string {
  if (r.type === "HOURLY" && r.dueAtHours != null) return `${r.dueAtHours.toFixed(1)} h`;
  if (r.type === "CYCLES" && r.dueAtCycles != null) return `${r.dueAtCycles} cy`;
  if (r.type === "CALENDAR" && r.dueAtDate) return formatDate(r.dueAtDate);
  return "—";
}

export function GestionMaintenanceView() {
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [openVisits, setOpenVisits] = useState<MaintenanceVisit[]>([]);
  const [closedVisits, setClosedVisits] = useState<MaintenanceVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [openingFor, setOpeningFor] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [ac, rec, open, closed] = await Promise.all([
        apiFetch<Aircraft[]>("/api/aircraft"),
        apiFetch<MaintenanceRecord[]>("/api/maintenance"),
        apiFetch<MaintenanceVisit[]>("/api/maintenance-visits?status=OPEN"),
        apiFetch<MaintenanceVisit[]>("/api/maintenance-visits?status=CLOSED"),
      ]);
      setAircraftList(ac.filter((a) => a.status !== "RETIRED"));
      setRecords(rec);
      setOpenVisits(open);
      setClosedVisits(closed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleOpenVisit(aircraftId: string) {
    setOpeningFor(aircraftId);
    try {
      const visit = await apiFetch<MaintenanceVisit>("/api/maintenance-visits", {
        method: "POST",
        body: JSON.stringify({ aircraftId }),
      });
      await load();
      setActiveVisitId(visit.id);
    } finally {
      setOpeningFor(null);
    }
  }

  return (
    <div>
      <GestionPageHeader
        title="Maintenance"
        subtitle="Potentiels de la flotte en temps réel, synchronisés avec les vols enregistrés"
      />
      <div className="px-4 md:px-10 pb-10 flex flex-col gap-8">
        {!loading && aircraftList.length === 0 && (
          <div className="bg-navy-900 rounded-2xl border border-navy-700 p-8 text-center text-sm text-navy-100/50">
            Aucun avion dans la flotte pour l&apos;instant.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {aircraftList.map((a) => {
            const acRecords = records.filter((r) => r.aircraftId === a.id && r.status !== "DONE");
            const visit = openVisits.find((v) => v.aircraftId === a.id);
            return (
              <AircraftMaintenanceCard
                key={a.id}
                aircraft={a}
                records={acRecords}
                openVisit={visit}
                opening={openingFor === a.id}
                onOpenVisit={() => handleOpenVisit(a.id)}
                onViewVisit={() => visit && setActiveVisitId(visit.id)}
              />
            );
          })}
        </div>

        <div>
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold text-navy-100/50 hover:text-cream-50 bg-navy-900 border border-navy-700 hover:bg-navy-800 px-3 py-1.5 rounded-full transition-colors"
          >
            {showHistory ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Historique des visites ({closedVisits.length})
          </button>
          {showHistory && (
            <div className="mt-3 flex flex-col gap-2">
              {closedVisits.length === 0 && (
                <p className="text-sm text-navy-100/40">Aucune visite clôturée pour l&apos;instant.</p>
              )}
              {closedVisits.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setActiveVisitId(v.id)}
                  className="text-left bg-navy-900 rounded-xl border border-navy-700 hover:border-navy-600 px-4 py-3 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-cream-50 truncate">
                      {v.aircraft?.registration} · {v.title}
                    </p>
                    <p className="text-xs text-navy-100/40">
                      Clôturée le {v.closedAt ? formatDate(v.closedAt) : "—"}
                      {v.performedBy ? ` · ${v.performedBy}` : ""}
                    </p>
                  </div>
                  <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeVisitId && (
        <VisitDetailModal visitId={activeVisitId} onClose={() => setActiveVisitId(null)} onChanged={load} />
      )}
    </div>
  );
}

function AircraftMaintenanceCard({
  aircraft,
  records,
  openVisit,
  opening,
  onOpenVisit,
  onViewVisit,
}: {
  aircraft: Aircraft;
  records: MaintenanceRecord[];
  openVisit?: MaintenanceVisit;
  opening: boolean;
  onOpenVisit: () => void;
  onViewVisit: () => void;
}) {
  const overdue = records.filter((r) => r.status === "OVERDUE").length;
  const due = records.filter((r) => r.status === "DUE").length;
  const sorted = [...records].sort((a, b) => {
    const rank: Record<string, number> = { OVERDUE: 0, DUE: 1, UPCOMING: 2 };
    return rank[a.status] - rank[b.status];
  });

  return (
    <div className="bg-navy-900 rounded-2xl border border-navy-700 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-cream-50">{aircraft.registration}</p>
          <p className="text-xs text-navy-100/50">{aircraft.type}</p>
        </div>
        <span
          className={clsx(
            "text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0",
            overdue > 0 ? STATUS_STYLE.OVERDUE : due > 0 ? STATUS_STYLE.DUE : "bg-green-500/15 text-green-400"
          )}
        >
          {overdue > 0 ? `${overdue} dépassée(s)` : due > 0 ? `${due} proche(s)` : "À jour"}
        </span>
      </div>
      <p className="text-xs text-navy-100/50">
        {formatHours(aircraft.totalHours)} · {aircraft.totalCycles} cycles
      </p>

      {sorted.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-navy-800 pt-2.5">
          {sorted.slice(0, 3).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-navy-100/70 truncate">{r.label}</span>
              <span
                className={clsx(
                  "shrink-0",
                  r.status === "OVERDUE" ? "text-red-400" : r.status === "DUE" ? "text-sunset-500" : "text-navy-100/40"
                )}
              >
                {dueSummary(r)}
              </span>
            </li>
          ))}
          {sorted.length > 3 && <li className="text-[11px] text-navy-100/30">+ {sorted.length - 3} autre(s)</li>}
        </ul>
      )}

      {openVisit ? (
        <button
          onClick={onViewVisit}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-cream-50 text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Wrench size={14} /> Visite en cours →
        </button>
      ) : (
        <button
          onClick={onOpenVisit}
          disabled={opening}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors disabled:opacity-60"
        >
          <Plus size={14} /> {opening ? "Ouverture..." : "Ouvrir une visite"}
        </button>
      )}
    </div>
  );
}

function VisitDetailModal({
  visitId,
  onClose,
  onChanged,
}: {
  visitId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [visit, setVisit] = useState<MaintenanceVisit | null>(null);
  const [candidateRecords, setCandidateRecords] = useState<MaintenanceRecord[]>([]);
  const [title, setTitle] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeDescription, setCloseDescription] = useState("");
  const [closing, setClosing] = useState(false);
  const [addRecordId, setAddRecordId] = useState("");

  async function load() {
    const [v, all] = await Promise.all([
      apiFetch<MaintenanceVisit>(`/api/maintenance-visits/${visitId}`),
      apiFetch<MaintenanceRecord[]>("/api/maintenance"),
    ]);
    setVisit(v);
    setTitle(v.title);
    setPerformedBy(v.performedBy ?? "");
    setReference(v.reference ?? "");
    setNotes(v.notes ?? "");
    setCandidateRecords(
      all.filter(
        (r) => r.aircraftId === v.aircraftId && r.status !== "DONE" && (r.maintenanceVisitId == null || r.maintenanceVisitId === v.id)
      )
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  async function saveFields() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/maintenance-visits/${visitId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          performedBy: performedBy || null,
          reference: reference || null,
          notes: notes || null,
        }),
      });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function addRecord() {
    if (!addRecordId) return;
    await apiFetch(`/api/maintenance-visits/${visitId}`, {
      method: "PATCH",
      body: JSON.stringify({ addRecordIds: [addRecordId] }),
    });
    setAddRecordId("");
    await load();
    onChanged();
  }

  async function removeRecord(recordId: string) {
    await apiFetch(`/api/maintenance-visits/${visitId}`, {
      method: "PATCH",
      body: JSON.stringify({ removeRecordIds: [recordId] }),
    });
    await load();
    onChanged();
  }

  async function handleClose() {
    setClosing(true);
    setError(null);
    try {
      await apiFetch(`/api/maintenance-visits/${visitId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          performedBy: performedBy || null,
          reference: reference || null,
          notes: notes || null,
          close: { description: closeDescription || null },
        }),
      });
      setShowCloseConfirm(false);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setClosing(false);
    }
  }

  async function handleDeleteVisit() {
    if (!window.confirm("Supprimer cette visite ? Les échéances rattachées redeviennent libres, rien n'est perdu.")) return;
    await apiFetch(`/api/maintenance-visits/${visitId}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/maintenance-visits/${visitId}/documents`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ? String(data.error) : `Erreur ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!window.confirm("Supprimer ce document ?")) return;
    await apiFetch(`/api/maintenance-visits/${visitId}/documents/${docId}`, { method: "DELETE" });
    await load();
  }

  if (!visit) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
        <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-xl p-8 text-center text-sm text-navy-100/50">
          Chargement...
        </div>
      </div>
    );
  }

  const isOpen = visit.status === "OPEN";
  const attached = visit.records.filter((r) => r.status !== "DONE");
  const doneItems = visit.records.filter((r) => r.status === "DONE");
  const addable = candidateRecords.filter((r) => !visit.records.some((vr) => vr.id === r.id));

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800 sticky top-0 bg-navy-900 z-10">
          <div>
            <h2 className="font-semibold text-cream-50">
              {visit.aircraft?.registration} · {visit.aircraft?.type}
            </h2>
            <span
              className={clsx(
                "inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                isOpen ? "bg-sunset-500/15 text-sunset-500" : "bg-green-500/15 text-green-400"
              )}
            >
              {isOpen ? "Visite en cours" : "Clôturée"}
            </span>
          </div>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {error && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex flex-col gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveFields} className="input-dark font-semibold" />
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Atelier / mécanicien"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                onBlur={saveFields}
                className="input-dark text-sm"
              />
              <input
                placeholder="Réf. bon de travail / facture"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                onBlur={saveFields}
                className="input-dark text-sm"
              />
            </div>
            <textarea
              placeholder="Notes (optionnel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveFields}
              className="input-dark text-sm min-h-16"
            />
            {saving && <p className="text-[11px] text-navy-100/30">Enregistrement...</p>}
          </div>

          <div>
            <p className="text-xs font-semibold text-navy-100/50 mb-2">
              Échéances {isOpen ? "à traiter" : "soldées"} ({attached.length || doneItems.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {(isOpen ? attached : doneItems).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 bg-navy-950 border border-navy-800 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-cream-50 truncate">{r.label}</p>
                    <p className="text-[11px] text-navy-100/40">Échéance : {dueSummary(r)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", STATUS_STYLE[r.status])}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {isOpen && (
                      <button onClick={() => removeRecord(r.id)} title="Retirer de la visite" className="text-navy-100/40 hover:text-red-400">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isOpen && attached.length === 0 && (
                <p className="text-xs text-navy-100/40">Aucune échéance rattachée — ajoutes-en une ci-dessous si besoin.</p>
              )}
            </div>
            {isOpen && addable.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <select value={addRecordId} onChange={(e) => setAddRecordId(e.target.value)} className="input-dark text-sm flex-1">
                  <option value="">Ajouter une échéance...</option>
                  {addable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} ({dueSummary(r)})
                    </option>
                  ))}
                </select>
                <button
                  onClick={addRecord}
                  disabled={!addRecordId}
                  className="shrink-0 rounded-lg bg-navy-800 hover:bg-navy-700 text-cream-50 text-sm font-semibold px-3 py-2 disabled:opacity-40 transition-colors"
                >
                  Ajouter
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-navy-100/50 mb-2">Documents ({visit.documents?.length ?? 0})</p>
            <div className="flex flex-col gap-1.5">
              {(visit.documents ?? []).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 bg-navy-950 border border-navy-800 rounded-lg px-3 py-2">
                  <a
                    href={`/api/maintenance-visits/${visitId}/documents/${doc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 min-w-0 text-sm text-cream-50 hover:text-sunset-500 transition-colors"
                  >
                    <FileText size={15} className="shrink-0" />
                    <span className="truncate">{doc.fileName}</span>
                  </a>
                  <button onClick={() => handleDeleteDoc(doc.id)} className="shrink-0 text-navy-100/40 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <label className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-navy-700 hover:border-navy-600 text-navy-100/50 hover:text-cream-50 text-sm px-3.5 py-2 cursor-pointer transition-colors">
              <Upload size={14} /> {uploading ? "Envoi..." : "Ajouter un document (PDF ou image, 4 Mo max)"}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {isOpen && (
            <div className="flex flex-col gap-2 pt-2 border-t border-navy-800">
              {showCloseConfirm ? (
                <div className="flex flex-col gap-2 bg-navy-950 border border-navy-800 rounded-lg p-3">
                  <p className="text-sm text-cream-50">
                    Clôturer soldera {attached.length} échéance(s), consignera le Kardex, et reprogrammera
                    automatiquement celles qui ont un renouvellement défini.
                  </p>
                  <textarea
                    placeholder="Description de l'intervention (optionnel)"
                    value={closeDescription}
                    onChange={(e) => setCloseDescription(e.target.value)}
                    className="input-dark text-sm min-h-14"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClose}
                      disabled={closing}
                      className="rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-3.5 py-2 disabled:opacity-60 transition-colors"
                    >
                      {closing ? "Clôture..." : "Confirmer la clôture"}
                    </button>
                    <button
                      onClick={() => setShowCloseConfirm(false)}
                      className="rounded-lg text-navy-100/50 hover:text-cream-50 text-sm px-3 py-2"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCloseConfirm(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
                  >
                    <CheckCircle2 size={15} /> Clôturer la visite
                  </button>
                  <button onClick={handleDeleteVisit} className="text-red-400/70 hover:text-red-400 text-sm px-3 py-2">
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
