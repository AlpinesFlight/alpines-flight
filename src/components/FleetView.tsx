"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Aircraft, KardexCategory, KardexEntry, MaintenanceRecord, MaintenanceStatus, MaintenanceType } from "@/types/models";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { Plus, X, Plane, Pencil, Trash2, Wrench, BookOpen, Check } from "lucide-react";
import { clsx } from "clsx";

const STATUS_STYLE: Record<MaintenanceStatus, string> = {
  UPCOMING: "bg-navy-100 text-navy-800",
  DUE: "bg-sunset-100 text-sunset-600",
  OVERDUE: "bg-red-100 text-red-600",
  DONE: "bg-green-100 text-green-700",
};

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  UPCOMING: "À venir",
  DUE: "À prévoir",
  OVERDUE: "Dépassé",
  DONE: "Fait",
};

const AIRCRAFT_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Disponible",
  MAINTENANCE: "Maintenance",
  GROUNDED: "Immobilisé",
  RETIRED: "Retiré",
};

const KARDEX_CATEGORY_LABEL: Record<KardexCategory, string> = {
  VISITE: "Visite",
  REPARATION: "Réparation",
  CONSIGNE_NAVIGABILITE: "Consigne de navigabilité",
  PIECE_REMPLACEE: "Pièce remplacée",
  AUTRE: "Autre",
};

export function FleetView() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateAircraft, setShowCreateAircraft] = useState(false);
  const [detailFor, setDetailFor] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<Aircraft[]>("/api/aircraft");
      setAircraft(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-end mb-5">
        <button
          onClick={() => setShowCreateAircraft(true)}
          className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Nouvel avion
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {aircraft.map((a) => (
          <button
            key={a.id}
            onClick={() => setDetailFor(a.id)}
            className="text-left bg-white rounded-2xl border border-navy-100 overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="relative h-28">
              {a.photoMimeType ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/aircraft/${a.id}/photo`}
                  alt={a.registration}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ backgroundColor: a.color }}
                >
                  <Plane size={32} className="text-white/70" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-950/80 to-transparent px-5 pt-6 pb-2.5 flex items-end justify-between gap-2">
                <div>
                  <p className="font-semibold text-white leading-tight">{a.registration}</p>
                  <p className="text-xs text-white/80">{a.type}</p>
                </div>
                <span
                  className={clsx(
                    "text-[11px] font-semibold px-2 py-1 rounded-full bg-white/90 shrink-0",
                    a.status === "AVAILABLE" && "text-green-700",
                    a.status === "MAINTENANCE" && "text-sunset-600",
                    a.status === "GROUNDED" && "text-red-600",
                    a.status === "RETIRED" && "text-navy-500"
                  )}
                >
                  {AIRCRAFT_STATUS_LABEL[a.status]}
                </span>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span className="text-navy-600">Tarif</span>
                <span className="font-medium text-navy-900">
                  {formatMoney(a.hourlyRateCents)}/h
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-navy-600">Heures cellule</span>
                <span className="font-medium text-navy-900">{formatHours(a.totalHours)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-navy-600">Cycles (atterrissages)</span>
                <span className="font-medium text-navy-900">{a.totalCycles}</span>
              </div>

              <div className="border-t border-navy-100 pt-3">
                <p className="text-xs font-semibold text-navy-600 mb-1.5">Maintenance</p>
                <div className="flex flex-col gap-1.5">
                  {(a.maintenanceRecords ?? []).filter((m) => m.status !== "DONE").length === 0 && (
                    <p className="text-xs text-navy-600">Aucune échéance en cours.</p>
                  )}
                  {(a.maintenanceRecords ?? [])
                    .filter((m) => m.status !== "DONE")
                    .slice(0, 3)
                    .map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="text-navy-700">{m.label}</span>
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded-full font-medium",
                            STATUS_STYLE[m.status]
                          )}
                        >
                          {STATUS_LABEL[m.status]}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </button>
        ))}
        {!loading && aircraft.length === 0 && (
          <p className="text-navy-600 text-sm">Aucun avion enregistré.</p>
        )}
      </div>

      {showCreateAircraft && (
        <CreateAircraftModal
          onClose={() => setShowCreateAircraft(false)}
          onCreated={() => {
            setShowCreateAircraft(false);
            load();
          }}
        />
      )}

      {detailFor && (
        <AircraftDetailModal
          aircraftId={detailFor}
          onClose={() => setDetailFor(null)}
          onChanged={load}
          onDeleted={() => {
            setDetailFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateAircraftModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [registration, setRegistration] = useState("");
  const [type, setType] = useState("");
  const [hourlyRate, setHourlyRate] = useState("150");
  const [totalHours, setTotalHours] = useState("0");
  const [totalCycles, setTotalCycles] = useState("0");
  const [color, setColor] = useState("#0C2448");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/aircraft", {
        method: "POST",
        body: JSON.stringify({
          registration,
          type,
          hourlyRateCents: Math.round(parseFloat(hourlyRate) * 100),
          totalHours: parseFloat(totalHours),
          totalCycles: parseInt(totalCycles, 10) || 0,
          color,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Nouvel avion</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <input
            required
            placeholder="Immatriculation (F-XXXX)"
            value={registration}
            onChange={(e) => setRegistration(e.target.value.toUpperCase())}
            className="input"
          />
          <input
            required
            placeholder="Type (ex: Robin DR400)"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="input"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              type="number"
              step="0.01"
              placeholder="Tarif €/h"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="input"
            />
            <input
              required
              type="number"
              step="0.1"
              placeholder="Heures cellule"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
              className="input"
            />
          </div>
          <input
            type="number"
            step="1"
            placeholder="Cycles / atterrissages actuels"
            value={totalCycles}
            onChange={(e) => setTotalCycles(e.target.value)}
            className="input"
          />
          <label className="flex items-center gap-2 text-sm text-navy-700">
            Couleur planning
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-9 h-9 rounded border border-navy-100"
            />
          </label>
          {error && (
            <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Création..." : "Créer l'avion"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- Détail avion : caractéristiques / échéances / kardex ----------

interface AircraftFull extends Aircraft {
  maintenanceRecords: MaintenanceRecord[];
  kardexEntries: KardexEntry[];
}

function AircraftDetailModal({
  aircraftId,
  onClose,
  onChanged,
  onDeleted,
}: {
  aircraftId: string;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<AircraftFull | null>(null);
  const [tab, setTab] = useState<"info" | "maintenance" | "kardex">("info");
  const [showMaintForm, setShowMaintForm] = useState<MaintenanceRecord | null | "new">(null);
  const [showKardexForm, setShowKardexForm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    const fresh = await apiFetch<AircraftFull>(`/api/aircraft/${aircraftId}`);
    setData(fresh);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraftId]);

  function refreshAll() {
    load();
    onChanged();
  }

  async function handleDelete() {
    if (!data) return;
    if (!window.confirm(`Supprimer définitivement ${data.registration} de la flotte ?`)) return;
    setDeleteError(null);
    try {
      await apiFetch(`/api/aircraft/${aircraftId}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function handleRetire() {
    if (!data) return;
    await apiFetch(`/api/aircraft/${aircraftId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "RETIRED" }),
    });
    setDeleteError(null);
    refreshAll();
  }

  async function handleMarkDone(record: MaintenanceRecord) {
    const performedBy = window.prompt("Réalisé par (atelier / mécanicien) — optionnel :") ?? undefined;
    await apiFetch(`/api/maintenance/${record.id}`, {
      method: "PATCH",
      body: JSON.stringify({ markDone: { performedBy } }),
    });
    refreshAll();
  }

  async function handleDeleteMaintenance(record: MaintenanceRecord) {
    if (!window.confirm(`Supprimer l'échéance « ${record.label} » ?`)) return;
    await apiFetch(`/api/maintenance/${record.id}`, { method: "DELETE" });
    refreshAll();
  }

  async function handleDeleteKardex(entryId: string) {
    if (!window.confirm("Supprimer cette entrée du kardex ?")) return;
    await apiFetch(`/api/kardex/${entryId}`, { method: "DELETE" });
    refreshAll();
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-navy-900">
            {data ? `${data.registration} — ${data.type}` : "Chargement..."}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {data && (
          <>
            <div className="flex gap-1 px-5 pt-3 border-b border-navy-100 overflow-x-auto">
              {(
                [
                  { key: "info", label: "Caractéristiques", icon: Pencil },
                  { key: "maintenance", label: "Échéances", icon: Wrench },
                  { key: "kardex", label: "Kardex", icon: BookOpen },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap",
                    tab === t.key
                      ? "border-sunset-500 text-navy-900"
                      : "border-transparent text-navy-600 hover:text-navy-900"
                  )}
                >
                  <t.icon size={14} /> {t.label}
                </button>
              ))}
            </div>

            {tab === "info" && (
              <AircraftInfoForm
                aircraft={data}
                onSaved={refreshAll}
                onDelete={handleDelete}
                onRetire={handleRetire}
                deleteError={deleteError}
              />
            )}

            {tab === "maintenance" && (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowMaintForm("new")}
                    className="flex items-center gap-1.5 text-xs font-semibold text-sunset-600 hover:underline"
                  >
                    <Plus size={14} /> Nouvelle échéance
                  </button>
                </div>
                {data.maintenanceRecords.length === 0 && (
                  <p className="text-sm text-navy-600">Aucune échéance enregistrée.</p>
                )}
                {data.maintenanceRecords.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-navy-100 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-navy-900">{m.label}</p>
                      <p className="text-xs text-navy-600">
                        {m.type === "HOURLY" && `Échéance à ${m.dueAtHours}h`}
                        {m.type === "CYCLES" && `Échéance à ${m.dueAtCycles} cycles`}
                        {m.type === "CALENDAR" && m.dueAtDate && `Échéance le ${formatDate(m.dueAtDate)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={clsx(
                          "text-xs font-semibold px-2 py-1 rounded-full",
                          STATUS_STYLE[m.status]
                        )}
                      >
                        {STATUS_LABEL[m.status]}
                      </span>
                      {m.status !== "DONE" && (
                        <button
                          onClick={() => handleMarkDone(m)}
                          title="Marquer fait"
                          className="text-green-700 hover:bg-green-100 rounded-lg p-1.5"
                        >
                          <Check size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => setShowMaintForm(m)}
                        title="Modifier"
                        className="text-navy-600 hover:bg-navy-50 rounded-lg p-1.5"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteMaintenance(m)}
                        title="Supprimer"
                        className="text-red-600 hover:bg-red-100 rounded-lg p-1.5"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "kardex" && (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowKardexForm(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-sunset-600 hover:underline"
                  >
                    <Plus size={14} /> Ajouter une intervention
                  </button>
                </div>
                {data.kardexEntries.length === 0 && (
                  <p className="text-sm text-navy-600">Aucune entrée au kardex.</p>
                )}
                {data.kardexEntries.map((k) => (
                  <div key={k.id} className="rounded-xl border border-navy-100 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-navy-900">{k.title}</p>
                        <p className="text-xs text-navy-600">
                          {formatDate(k.date)} · {KARDEX_CATEGORY_LABEL[k.category]}
                          {k.hoursAt != null ? ` · ${formatHours(k.hoursAt)}` : ""}
                          {k.cyclesAt != null ? ` · ${k.cyclesAt} cycles` : ""}
                        </p>
                        {k.description && (
                          <p className="text-xs text-navy-700 mt-1">{k.description}</p>
                        )}
                        {(k.performedBy || k.reference) && (
                          <p className="text-[11px] text-navy-500 mt-1">
                            {k.performedBy}
                            {k.performedBy && k.reference ? " · " : ""}
                            {k.reference}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteKardex(k.id)}
                        title="Supprimer"
                        className="text-navy-400 hover:text-red-600 shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showMaintForm && data && (
        <MaintenanceFormModal
          aircraft={data}
          existing={showMaintForm === "new" ? null : showMaintForm}
          onClose={() => setShowMaintForm(null)}
          onSaved={() => {
            setShowMaintForm(null);
            refreshAll();
          }}
        />
      )}

      {showKardexForm && data && (
        <KardexFormModal
          aircraft={data}
          onClose={() => setShowKardexForm(false)}
          onSaved={() => {
            setShowKardexForm(false);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function AircraftPhotoUpload({
  aircraft,
  onChanged,
}: {
  aircraft: AircraftFull;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/aircraft/${aircraft.id}/photo`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ? String(data.error) : `Erreur ${res.status}`);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm("Retirer la photo de cet avion ?")) return;
    setUploading(true);
    setError(null);
    try {
      await apiFetch(`/api/aircraft/${aircraft.id}/photo`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 h-20 rounded-xl overflow-hidden bg-navy-50 border border-navy-100 flex items-center justify-center shrink-0">
        {aircraft.photoMimeType ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/aircraft/${aircraft.id}/photo`}
            alt={aircraft.registration}
            className="w-full h-full object-cover"
          />
        ) : (
          <Plane size={24} className="text-navy-300" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-sunset-600 hover:underline cursor-pointer w-fit">
          {uploading ? "Envoi..." : aircraft.photoMimeType ? "Changer la photo" : "Ajouter une photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>
        {aircraft.photoMimeType && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="text-xs text-navy-500 hover:text-red-600 text-left"
          >
            Retirer la photo
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function AircraftInfoForm({
  aircraft,
  onSaved,
  onDelete,
  onRetire,
  deleteError,
}: {
  aircraft: AircraftFull;
  onSaved: () => void;
  onDelete: () => void;
  onRetire: () => void;
  deleteError: string | null;
}) {
  const [registration, setRegistration] = useState(aircraft.registration);
  const [type, setType] = useState(aircraft.type);
  const [hourlyRate, setHourlyRate] = useState(String(aircraft.hourlyRateCents / 100));
  const [status, setStatus] = useState(aircraft.status);
  const [totalHours, setTotalHours] = useState(String(aircraft.totalHours));
  const [totalCycles, setTotalCycles] = useState(String(aircraft.totalCycles));
  const [color, setColor] = useState(aircraft.color);
  const [notes, setNotes] = useState(aircraft.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/aircraft/${aircraft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          registration,
          type,
          hourlyRateCents: Math.round(parseFloat(hourlyRate) * 100),
          status,
          totalHours: parseFloat(totalHours),
          totalCycles: parseInt(totalCycles, 10) || 0,
          color,
          notes: notes || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
      <AircraftPhotoUpload aircraft={aircraft} onChanged={onSaved} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          required
          placeholder="Immatriculation"
          value={registration}
          onChange={(e) => setRegistration(e.target.value.toUpperCase())}
          className="input"
        />
        <input
          required
          placeholder="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="input"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          required
          type="number"
          step="0.01"
          placeholder="Tarif €/h"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
          className="input"
        />
        <input
          required
          type="number"
          step="0.1"
          placeholder="Heures cellule"
          value={totalHours}
          onChange={(e) => setTotalHours(e.target.value)}
          className="input"
        />
        <input
          type="number"
          step="1"
          placeholder="Cycles"
          value={totalCycles}
          onChange={(e) => setTotalCycles(e.target.value)}
          className="input"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="input"
        >
          <option value="AVAILABLE">Disponible</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="GROUNDED">Immobilisé</option>
          <option value="RETIRED">Retiré</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-navy-700">
          Couleur planning
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-9 h-9 rounded border border-navy-100"
          />
        </label>
      </div>
      <textarea
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="input min-h-16"
      />

      {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
      {deleteError && (
        <div className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2 flex flex-col gap-2">
          <span>{deleteError}</span>
          <button
            type="button"
            onClick={onRetire}
            className="self-start text-xs font-semibold underline"
          >
            Retirer de la flotte à la place
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700"
        >
          <Trash2 size={16} /> Supprimer l&apos;avion
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

function MaintenanceFormModal({
  aircraft,
  existing,
  onClose,
  onSaved,
}: {
  aircraft: Aircraft;
  existing: MaintenanceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [type, setType] = useState<MaintenanceType>(existing?.type ?? "HOURLY");
  const [dueAtHours, setDueAtHours] = useState(existing?.dueAtHours != null ? String(existing.dueAtHours) : "");
  const [dueAtCycles, setDueAtCycles] = useState(existing?.dueAtCycles != null ? String(existing.dueAtCycles) : "");
  const [dueAtDate, setDueAtDate] = useState(existing?.dueAtDate ? existing.dueAtDate.slice(0, 10) : "");
  const [alertBefore, setAlertBefore] = useState(String(existing?.alertBefore ?? 10));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        aircraftId: aircraft.id,
        label,
        type,
        dueAtHours: type === "HOURLY" ? parseFloat(dueAtHours) : null,
        dueAtCycles: type === "CYCLES" ? parseInt(dueAtCycles, 10) : null,
        dueAtDate: type === "CALENDAR" ? dueAtDate : null,
        alertBefore: parseFloat(alertBefore),
        notes: notes || null,
      };
      if (existing) {
        await apiFetch(`/api/maintenance/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/maintenance", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">
            {existing ? "Modifier l'échéance" : "Nouvelle échéance"} · {aircraft.registration}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <input
            required
            placeholder="Libellé (ex: Visite 100h)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="input"
          />
          <select value={type} onChange={(e) => setType(e.target.value as MaintenanceType)} className="input">
            <option value="HOURLY">Échéance en heures de vol</option>
            <option value="CYCLES">Échéance en cycles (atterrissages)</option>
            <option value="CALENDAR">Échéance calendaire</option>
          </select>
          {type === "HOURLY" && (
            <input
              required
              type="number"
              step="0.1"
              placeholder="Heures cellule à ne pas dépasser"
              value={dueAtHours}
              onChange={(e) => setDueAtHours(e.target.value)}
              className="input"
            />
          )}
          {type === "CYCLES" && (
            <input
              required
              type="number"
              step="1"
              placeholder="Cycles à ne pas dépasser"
              value={dueAtCycles}
              onChange={(e) => setDueAtCycles(e.target.value)}
              className="input"
            />
          )}
          {type === "CALENDAR" && (
            <input
              required
              type="date"
              value={dueAtDate}
              onChange={(e) => setDueAtDate(e.target.value)}
              className="input"
            />
          )}
          <input
            type="number"
            placeholder="Alerte avant échéance (heures, cycles ou jours)"
            value={alertBefore}
            onChange={(e) => setAlertBefore(e.target.value)}
            className="input"
          />
          <textarea
            placeholder="Notes (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-14"
          />
          {error && (
            <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : existing ? "Enregistrer" : "Ajouter l'échéance"}
          </button>
        </form>
      </div>
    </div>
  );
}

function KardexFormModal({
  aircraft,
  onClose,
  onSaved,
}: {
  aircraft: Aircraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<KardexCategory>("VISITE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hoursAt, setHoursAt] = useState(String(aircraft.totalHours));
  const [cyclesAt, setCyclesAt] = useState(String(aircraft.totalCycles));
  const [performedBy, setPerformedBy] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/kardex", {
        method: "POST",
        body: JSON.stringify({
          aircraftId: aircraft.id,
          date,
          category,
          title,
          description: description || null,
          hoursAt: hoursAt ? parseFloat(hoursAt) : null,
          cyclesAt: cyclesAt ? parseInt(cyclesAt, 10) : null,
          performedBy: performedBy || null,
          reference: reference || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Kardex · {aircraft.registration}</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as KardexCategory)}
              className="input"
            >
              {Object.entries(KARDEX_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <input
            required
            placeholder="Titre (ex: Remplacement magnéto gauche)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
          <textarea
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-14"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="number"
              step="0.1"
              placeholder="Heures cellule"
              value={hoursAt}
              onChange={(e) => setHoursAt(e.target.value)}
              className="input"
            />
            <input
              type="number"
              step="1"
              placeholder="Cycles"
              value={cyclesAt}
              onChange={(e) => setCyclesAt(e.target.value)}
              className="input"
            />
          </div>
          <input
            placeholder="Réalisé par (atelier / mécanicien)"
            value={performedBy}
            onChange={(e) => setPerformedBy(e.target.value)}
            className="input"
          />
          <input
            placeholder="Référence (bon de travail, CN...)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="input"
          />
          {error && (
            <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Ajouter au kardex"}
          </button>
        </form>
      </div>
    </div>
  );
}
