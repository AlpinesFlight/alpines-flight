"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { formatDate, formatHours } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import {
  Aircraft,
  KardexCategory,
  KardexEntry,
  MaintenanceRecord,
  MaintenanceType,
  MaintenanceVisit,
} from "@/types/models";
import { ArrowLeft, Plus, X, Pencil, Trash2, Check, ChevronDown, ChevronRight, CheckCircle2, Download } from "lucide-react";

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

const KARDEX_CATEGORY_LABEL: Record<KardexCategory, string> = {
  VISITE: "Visite",
  REPARATION: "Réparation",
  CONSIGNE_NAVIGABILITE: "Consigne de navigabilité",
  PIECE_REMPLACEE: "Pièce remplacée",
  AUTRE: "Autre",
};

function dueSummary(r: MaintenanceRecord): string {
  const parts: string[] = [];
  if (r.dueAtHours != null) parts.push(`${r.dueAtHours.toFixed(1)} h`);
  if (r.dueAtCycles != null) parts.push(`${r.dueAtCycles} cy`);
  if (r.dueAtDate) parts.push(formatDate(r.dueAtDate));
  return parts.length > 0 ? parts.join(" ou ") : "—";
}

export function GestionAircraftMaintenanceView({ aircraftId }: { aircraftId: string }) {
  const [aircraft, setAircraft] = useState<Aircraft | null>(null);
  const [openVisits, setOpenVisits] = useState<MaintenanceVisit[]>([]);
  const [closedVisits, setClosedVisits] = useState<MaintenanceVisit[]>([]);
  const [tab, setTab] = useState<"echeances" | "kardex" | "visites">("echeances");
  const [showRecordForm, setShowRecordForm] = useState<MaintenanceRecord | "new" | null>(null);
  const [kardexEditingId, setKardexEditingId] = useState<string | "new" | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    const [a, open, closed] = await Promise.all([
      apiFetch<Aircraft>(`/api/aircraft/${aircraftId}`),
      apiFetch<MaintenanceVisit[]>(`/api/maintenance-visits?aircraftId=${aircraftId}&status=OPEN`),
      apiFetch<MaintenanceVisit[]>(`/api/maintenance-visits?aircraftId=${aircraftId}&status=CLOSED`),
    ]);
    setAircraft(a);
    setOpenVisits(open);
    setClosedVisits(closed);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraftId]);

  async function handleMarkDone(record: MaintenanceRecord) {
    const performedBy = window.prompt("Réalisé par (atelier / mécanicien) — optionnel :") ?? undefined;
    await apiFetch(`/api/maintenance/${record.id}`, {
      method: "PATCH",
      body: JSON.stringify({ markDone: { performedBy } }),
    });
    load();
  }

  async function handleDeleteRecord(record: MaintenanceRecord) {
    if (!window.confirm(`Supprimer l'échéance « ${record.label} » ?`)) return;
    await apiFetch(`/api/maintenance/${record.id}`, { method: "DELETE" });
    load();
  }

  async function handleDeleteKardex(entry: KardexEntry) {
    if (!window.confirm(`Supprimer cette entrée du kardex (« ${entry.title} ») ?`)) return;
    await apiFetch(`/api/kardex/${entry.id}`, { method: "DELETE" });
    load();
  }

  async function handleSaveKardex(id: string | "new", payload: Record<string, unknown>) {
    if (id === "new") {
      await apiFetch("/api/kardex", { method: "POST", body: JSON.stringify({ aircraftId, ...payload }) });
    } else {
      await apiFetch(`/api/kardex/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    }
    setKardexEditingId(null);
    load();
  }

  async function handleExportKardex() {
    const XLSX = await import("xlsx");
    const rows = kardex.map((k) => ({
      Date: formatDate(k.date),
      Catégorie: KARDEX_CATEGORY_LABEL[k.category],
      Titre: k.title,
      Référence: k.reference ?? "",
      "Heures cellule": k.hoursAt ?? "",
      Cycles: k.cyclesAt ?? "",
      "Effectué par": k.performedBy ?? "",
      Description: k.description ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Kardex");
    XLSX.writeFile(workbook, `Kardex-${aircraft?.registration ?? aircraftId}.xlsx`);
  }

  if (!aircraft) {
    return (
      <div className="px-4 md:px-10 py-10 text-navy-100/50 text-sm">Chargement...</div>
    );
  }

  const records = [...(aircraft.maintenanceRecords ?? [])].sort((a, b) => {
    const rank: Record<string, number> = { OVERDUE: 0, DUE: 1, UPCOMING: 2, DONE: 3 };
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
  });
  const kardex = [...(aircraft.kardexEntries ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      <GestionPageHeader
        title={`${aircraft.registration} — ${aircraft.type}`}
        subtitle={`${formatHours(aircraft.totalHours)} · ${aircraft.totalCycles} cycles`}
        action={
          <Link
            href="/gestion/maintenance"
            className="flex items-center gap-1.5 text-sm text-navy-100/60 hover:text-cream-50 transition-colors"
          >
            <ArrowLeft size={16} /> Retour à la flotte
          </Link>
        }
      />
      <div className="px-4 md:px-10 pb-10">
        <div className="flex gap-1 border-b border-navy-800 mb-5">
          {(
            [
              { key: "echeances", label: `Échéances (${records.filter((r) => r.status !== "DONE").length})` },
              { key: "kardex", label: `Kardex (${kardex.length})` },
              { key: "visites", label: `Visites (${openVisits.length + closedVisits.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.key ? "border-sunset-500 text-cream-50" : "border-transparent text-navy-100/50 hover:text-cream-50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "echeances" && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <button
                onClick={() => setShowRecordForm("new")}
                className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
              >
                <Plus size={15} /> Nouvelle échéance
              </button>
            </div>
            {records.length === 0 && <p className="text-sm text-navy-100/40">Aucune échéance enregistrée.</p>}
            {records.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 bg-navy-900 border border-navy-700 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-cream-50 truncate">
                    {r.label}
                    {r.reference && <span className="text-navy-100/40"> · {r.reference}</span>}
                  </p>
                  <p className="text-xs text-navy-100/50">
                    {r.zone && <span>{r.zone} · </span>}
                    Échéance : {dueSummary(r)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={clsx("text-[11px] font-semibold px-2 py-1 rounded-full", STATUS_STYLE[r.status])}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.status !== "DONE" && (
                    <button onClick={() => handleMarkDone(r)} title="Marquer fait" className="text-green-400 hover:bg-green-500/10 rounded-lg p-1.5">
                      <Check size={15} />
                    </button>
                  )}
                  <button onClick={() => setShowRecordForm(r)} title="Modifier" className="text-navy-100/50 hover:text-cream-50 rounded-lg p-1.5">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDeleteRecord(r)} title="Supprimer" className="text-navy-100/50 hover:text-red-400 rounded-lg p-1.5">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "kardex" && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end gap-2">
              <button
                onClick={handleExportKardex}
                disabled={kardex.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 disabled:opacity-40 disabled:hover:bg-navy-800 text-navy-100 text-sm font-semibold px-3.5 py-2 transition-colors"
              >
                <Download size={15} /> Exporter en Excel
              </button>
              <button
                onClick={() => setKardexEditingId("new")}
                className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
              >
                <Plus size={15} /> Nouvelle entrée
              </button>
            </div>
            <div className="overflow-x-auto bg-navy-900 border border-navy-700 rounded-xl">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-navy-100/40 border-b border-navy-700">
                    <th className="px-3 py-2 font-semibold w-[110px]">Date</th>
                    <th className="px-3 py-2 font-semibold w-[150px]">Catégorie</th>
                    <th className="px-3 py-2 font-semibold min-w-[220px]">Titre</th>
                    <th className="px-3 py-2 font-semibold w-[140px]">Référence</th>
                    <th className="px-3 py-2 font-semibold w-[110px]">Heures</th>
                    <th className="px-3 py-2 font-semibold w-[90px]">Cycles</th>
                    <th className="px-3 py-2 font-semibold w-[140px]">Effectué par</th>
                    <th className="px-3 py-2 font-semibold w-[80px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {kardexEditingId === "new" && (
                    <KardexEditRow
                      aircraft={aircraft}
                      existing={null}
                      onCancel={() => setKardexEditingId(null)}
                      onSave={(payload) => handleSaveKardex("new", payload)}
                    />
                  )}
                  {kardex.length === 0 && kardexEditingId !== "new" && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-navy-100/40">
                        Aucune entrée au kardex.
                      </td>
                    </tr>
                  )}
                  {kardex.map((k) =>
                    kardexEditingId === k.id ? (
                      <KardexEditRow
                        key={k.id}
                        aircraft={aircraft}
                        existing={k}
                        onCancel={() => setKardexEditingId(null)}
                        onSave={(payload) => handleSaveKardex(k.id, payload)}
                      />
                    ) : (
                      <KardexViewRow
                        key={k.id}
                        entry={k}
                        onEdit={() => setKardexEditingId(k.id)}
                        onDelete={() => handleDeleteKardex(k)}
                      />
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "visites" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold text-navy-100/50 mb-2">En cours ({openVisits.length})</p>
              {openVisits.length === 0 && <p className="text-sm text-navy-100/40">Aucune visite en cours.</p>}
              <div className="flex flex-col gap-2">
                {openVisits.map((v) => (
                  <div key={v.id} className="bg-navy-900 border border-navy-700 rounded-xl px-4 py-3">
                    <p className="text-sm font-medium text-cream-50">{v.title}</p>
                    <p className="text-xs text-navy-100/40">Ouverte le {formatDate(v.openedAt)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <button
                onClick={() => setShowHistory((s) => !s)}
                className="flex items-center gap-1.5 text-xs font-semibold text-navy-100/50 hover:text-cream-50 bg-navy-900 border border-navy-700 hover:bg-navy-800 px-3 py-1.5 rounded-full transition-colors"
              >
                {showHistory ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Historique ({closedVisits.length})
              </button>
              {showHistory && (
                <div className="mt-3 flex flex-col gap-2">
                  {closedVisits.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-3 bg-navy-900 border border-navy-700 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-cream-50">{v.title}</p>
                        <p className="text-xs text-navy-100/40">
                          Clôturée le {v.closedAt ? formatDate(v.closedAt) : "—"}
                          {v.performedBy ? ` · ${v.performedBy}` : ""}
                        </p>
                      </div>
                      <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showRecordForm && (
        <RecordFormModal
          aircraftId={aircraftId}
          existing={showRecordForm === "new" ? null : showRecordForm}
          onClose={() => setShowRecordForm(null)}
          onSaved={() => {
            setShowRecordForm(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RecordFormModal({
  aircraftId,
  existing,
  onClose,
  onSaved,
}: {
  aircraftId: string;
  existing: MaintenanceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [reference, setReference] = useState(existing?.reference ?? "");
  const [zone, setZone] = useState(existing?.zone ?? "");
  const [type, setType] = useState<MaintenanceType>(existing?.type ?? "HOURLY");
  const [dueAtHours, setDueAtHours] = useState(existing?.dueAtHours != null ? String(existing.dueAtHours) : "");
  const [dueAtCycles, setDueAtCycles] = useState(existing?.dueAtCycles != null ? String(existing.dueAtCycles) : "");
  const [dueAtDate, setDueAtDate] = useState(existing?.dueAtDate ? existing.dueAtDate.slice(0, 10) : "");
  const [alertBefore, setAlertBefore] = useState(String(existing?.alertBefore ?? 10));
  const [renewalInterval, setRenewalInterval] = useState(
    existing?.intervalHours != null
      ? String(existing.intervalHours)
      : existing?.intervalCycles != null
        ? String(existing.intervalCycles)
        : existing?.intervalDays != null
          ? String(existing.intervalDays)
          : ""
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const intervalValue = renewalInterval ? parseFloat(renewalInterval) : null;
      const payload = {
        aircraftId,
        label,
        reference: reference || null,
        zone: zone || null,
        type,
        dueAtHours: dueAtHours ? parseFloat(dueAtHours) : null,
        dueAtCycles: dueAtCycles ? parseInt(dueAtCycles, 10) : null,
        dueAtDate: dueAtDate || null,
        alertBefore: parseFloat(alertBefore),
        intervalHours: type === "HOURLY" ? intervalValue : null,
        intervalCycles: type === "CYCLES" ? (intervalValue != null ? Math.round(intervalValue) : null) : null,
        intervalDays: type === "CALENDAR" ? (intervalValue != null ? Math.round(intervalValue) : null) : null,
        notes: notes || null,
      };
      if (existing) {
        await apiFetch(`/api/maintenance/${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/maintenance", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
          <h2 className="font-semibold text-cream-50">{existing ? "Modifier l'échéance" : "Nouvelle échéance"}</h2>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <input required placeholder="Libellé (ex: Visite 100h)" value={label} onChange={(e) => setLabel(e.target.value)} className="input-dark" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Référence (n° CN/BS, pièce...)" value={reference} onChange={(e) => setReference(e.target.value)} className="input-dark" />
            <input placeholder="Zone (Cellule, Moteur...)" value={zone} onChange={(e) => setZone(e.target.value)} className="input-dark" />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/50">Type principal</span>
            <select value={type} onChange={(e) => setType(e.target.value as MaintenanceType)} className="input-dark">
              <option value="HOURLY">Heures de vol</option>
              <option value="CYCLES">Cycles (atterrissages)</option>
              <option value="CALENDAR">Calendaire</option>
            </select>
          </label>
          <p className="text-xs text-navy-100/40">
            Une échéance peut avoir plusieurs seuils à la fois (ex: 100h ET 12 mois, au premier des deux) — renseigne
            ceux qui s&apos;appliquent, les autres restent vides.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="0.1" placeholder="Échéance en heures" value={dueAtHours} onChange={(e) => setDueAtHours(e.target.value)} className="input-dark" />
            <input type="number" step="1" placeholder="Échéance en cycles" value={dueAtCycles} onChange={(e) => setDueAtCycles(e.target.value)} className="input-dark" />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/50">Échéance calendaire</span>
            <input type="date" value={dueAtDate} onChange={(e) => setDueAtDate(e.target.value)} className="input-dark" />
          </label>
          <input type="number" placeholder="Alerte avant échéance (heures/jours/cycles)" value={alertBefore} onChange={(e) => setAlertBefore(e.target.value)} className="input-dark" />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/50">
              Renouvellement automatique (optionnel) — unité du type principal ci-dessus
            </span>
            <input type="number" placeholder="Tous les combien (h / jours / cycles)" value={renewalInterval} onChange={(e) => setRenewalInterval(e.target.value)} className="input-dark" />
          </label>
          <textarea placeholder="Notes (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} className="input-dark min-h-14" />
          {error && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60 transition-colors"
          >
            {saving ? "Enregistrement..." : existing ? "Enregistrer" : "Ajouter l'échéance"}
          </button>
        </form>
      </div>
    </div>
  );
}

function KardexViewRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: KardexEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-navy-800 last:border-b-0 hover:bg-navy-800/40 align-top">
      <td className="px-3 py-2.5 text-navy-100/70 whitespace-nowrap">{formatDate(entry.date)}</td>
      <td className="px-3 py-2.5 text-navy-100/70">{KARDEX_CATEGORY_LABEL[entry.category]}</td>
      <td className="px-3 py-2.5">
        <p className="text-cream-50 font-medium">{entry.title}</p>
        {entry.description && <p className="text-xs text-navy-100/40 mt-0.5">{entry.description}</p>}
      </td>
      <td className="px-3 py-2.5 text-navy-100/60">{entry.reference || "—"}</td>
      <td className="px-3 py-2.5 text-navy-100/70 whitespace-nowrap">
        {entry.hoursAt != null ? entry.hoursAt.toFixed(1) : "—"}
      </td>
      <td className="px-3 py-2.5 text-navy-100/70">{entry.cyclesAt ?? "—"}</td>
      <td className="px-3 py-2.5 text-navy-100/60">{entry.performedBy || "—"}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 justify-end">
          <button onClick={onEdit} title="Modifier" className="text-navy-100/50 hover:text-cream-50 rounded-lg p-1.5">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} title="Supprimer" className="text-navy-100/50 hover:text-red-400 rounded-lg p-1.5">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function KardexEditRow({
  aircraft,
  existing,
  onCancel,
  onSave,
}: {
  aircraft: Aircraft;
  existing: KardexEntry | null;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [date, setDate] = useState(existing?.date ? existing.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<KardexCategory>(existing?.category ?? "VISITE");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [hoursAt, setHoursAt] = useState(existing?.hoursAt != null ? String(existing.hoursAt) : String(aircraft.totalHours));
  const [cyclesAt, setCyclesAt] = useState(existing?.cyclesAt != null ? String(existing.cyclesAt) : String(aircraft.totalCycles));
  const [performedBy, setPerformedBy] = useState(existing?.performedBy ?? "");
  const [reference, setReference] = useState(existing?.reference ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) {
      setError("Le titre est requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        date,
        category,
        title,
        description: description || null,
        hoursAt: hoursAt ? parseFloat(hoursAt) : null,
        cyclesAt: cyclesAt ? parseInt(cyclesAt, 10) : null,
        performedBy: performedBy || null,
        reference: reference || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <>
      <tr className="border-b border-navy-700 bg-navy-800/60" onKeyDown={handleKeyDown}>
        <td className="px-2 py-2 align-top">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-dark text-xs px-2 py-1.5 w-full" />
        </td>
        <td className="px-2 py-2 align-top">
          <select value={category} onChange={(e) => setCategory(e.target.value as KardexCategory)} className="input-dark text-xs px-2 py-1.5 w-full">
            {Object.entries(KARDEX_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-2 align-top">
          <input
            autoFocus
            placeholder="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-dark text-xs px-2 py-1.5 w-full mb-1"
          />
          <textarea
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-dark text-xs px-2 py-1.5 w-full min-h-8"
          />
        </td>
        <td className="px-2 py-2 align-top">
          <input placeholder="Réf." value={reference} onChange={(e) => setReference(e.target.value)} className="input-dark text-xs px-2 py-1.5 w-full" />
        </td>
        <td className="px-2 py-2 align-top">
          <input type="number" step="0.1" value={hoursAt} onChange={(e) => setHoursAt(e.target.value)} className="input-dark text-xs px-2 py-1.5 w-full" />
        </td>
        <td className="px-2 py-2 align-top">
          <input type="number" step="1" value={cyclesAt} onChange={(e) => setCyclesAt(e.target.value)} className="input-dark text-xs px-2 py-1.5 w-full" />
        </td>
        <td className="px-2 py-2 align-top">
          <input placeholder="Atelier" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} className="input-dark text-xs px-2 py-1.5 w-full" />
        </td>
        <td className="px-2 py-2 align-top">
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              title="Enregistrer"
              className="text-green-400 hover:bg-green-500/10 rounded-lg p-1.5 disabled:opacity-50"
            >
              <Check size={15} />
            </button>
            <button onClick={onCancel} title="Annuler" className="text-navy-100/50 hover:text-red-400 rounded-lg p-1.5">
              <X size={15} />
            </button>
          </div>
        </td>
      </tr>
      {error && (
        <tr className="bg-navy-800/60">
          <td colSpan={8} className="px-3 pb-2 -mt-1 text-xs text-red-400">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
