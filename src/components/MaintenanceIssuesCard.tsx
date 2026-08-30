"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { Aircraft, MaintenanceIssue } from "@/types/models";
import { formatDateTime } from "@/lib/format";
import { isGerant } from "@/lib/permissions";
import { Wrench, Plus, X, Check } from "lucide-react";

// Deux vues dans une seule carte, selon le rôle : le Gérant traite les
// signalements de tout le monde (voir /api/maintenance-issues, scopé côté
// serveur), les autres comptes déclarent les leurs et suivent leur statut.
// Remplace la carte "Alertes maintenance" du tableau de bord pour tout
// compte hors Gérant (voir src/app/(app)/page.tsx).
export function MaintenanceIssuesCard() {
  const { data: session } = useSession();
  const manage = isGerant(session?.user?.role);

  const [issues, setIssues] = useState<MaintenanceIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<MaintenanceIssue[]>("/api/maintenance-issues");
      setIssues(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleResolve(id: string) {
    setResolvingId(id);
    try {
      await apiFetch(`/api/maintenance-issues/${id}`, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } finally {
      setResolvingId(null);
    }
  }

  const open = issues.filter((i) => i.status === "OPEN");
  const visibleIssues = manage ? open : issues.slice(0, 5);

  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
        <h2 className="flex items-center gap-2 font-semibold text-navy-900">
          <Wrench size={16} className="text-sunset-600" />
          {manage ? "Signalements pilotes" : "Retour maintenance"}
        </h2>
        {!manage && (
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-sunset-600 hover:underline"
          >
            <Plus size={14} /> Signaler un défaut
          </button>
        )}
      </div>

      {!manage && (
        <p className="px-5 pt-3 text-xs text-navy-600">
          Un petit défaut remarqué sur un avion (rayure, voyant, pneu à surveiller...) ? Signale-le,
          ça remonte directement au Gérant.
        </p>
      )}

      <div className="divide-y divide-navy-100 max-h-[420px] overflow-y-auto">
        {!loading && visibleIssues.length === 0 && (
          <p className="px-5 py-6 text-sm text-navy-600">
            {manage ? "Aucun signalement en cours." : "Aucun signalement envoyé pour l'instant."}
          </p>
        )}
        {visibleIssues.map((issue) => (
          <div key={issue.id} className="px-5 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-navy-900">
                {issue.aircraft.registration}
                {manage && (
                  <span className="font-normal text-navy-500">
                    {" "}
                    · {issue.reportedBy.firstName} {issue.reportedBy.lastName}
                  </span>
                )}
              </p>
              <p className="text-sm text-navy-700 mt-0.5">{issue.description}</p>
              <p className="text-[11px] text-navy-400 mt-1">{formatDateTime(issue.createdAt)}</p>
            </div>
            {manage ? (
              <button
                onClick={() => handleResolve(issue.id)}
                disabled={resolvingId === issue.id}
                title="Marquer résolu"
                className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 hover:bg-green-200 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50 shrink-0"
              >
                <Check size={12} /> Résolu
              </button>
            ) : (
              <span
                className={
                  "text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 " +
                  (issue.status === "RESOLVED"
                    ? "bg-green-100 text-green-700"
                    : "bg-sunset-100 text-sunset-600")
                }
              >
                {issue.status === "RESOLVED" ? "Traité" : "Signalé"}
              </span>
            )}
          </div>
        ))}
      </div>

      {showReport && (
        <ReportIssueModal
          onClose={() => setShowReport(false)}
          onReported={() => {
            setShowReport(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ReportIssueModal({
  onClose,
  onReported,
}: {
  onClose: () => void;
  onReported: () => void;
}) {
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([]);
  const [aircraftId, setAircraftId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Aircraft[]>("/api/aircraft").then((data) => {
      setAircraftList(data);
      setAircraftId((prev) => prev || data[0]?.id || "");
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/maintenance-issues", {
        method: "POST",
        body: JSON.stringify({ aircraftId, description }),
      });
      onReported();
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
          <h2 className="font-semibold text-navy-900">Signaler un défaut</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Avion</span>
            <select
              required
              value={aircraftId}
              onChange={(e) => setAircraftId(e.target.value)}
              className="input"
            >
              {aircraftList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.registration} — {a.type}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Ce que tu as remarqué</span>
            <textarea
              required
              minLength={3}
              placeholder="ex : pneu droit qui semble un peu dégonflé"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input min-h-24"
            />
          </label>
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving || !aircraftId}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Envoi..." : "Envoyer au Gérant"}
          </button>
        </form>
      </div>
    </div>
  );
}
