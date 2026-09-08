"use client";

import { useMemo, useState } from "react";
import { KardexCategory } from "@/types/models";
import { X, FileUp, Upload } from "lucide-react";

interface ParsedRow {
  sourceRow: number;
  cnNumber: string | null;
  label: string;
  act: string | null;
  appliedDate: string | null;
  appliedHours: number | null;
  intervalMonths: number | string | null;
  intervalHours: number | string | null;
  dueDate: string | null;
  dueHours: number | null;
  notes: string | null;
  suggestedInclude: boolean;
}

interface ParsedSheet {
  name: string;
  kind: "kardex" | "statut";
  rows: ParsedRow[];
}

interface ReviewRow extends ParsedRow {
  key: string;
  include: boolean;
  category: KardexCategory;
}

const CATEGORY_OPTIONS: { value: KardexCategory; label: string }[] = [
  { value: "VISITE", label: "Visite" },
  { value: "REPARATION", label: "Réparation" },
  { value: "CONSIGNE_NAVIGABILITE", label: "Consigne de navigabilité" },
  { value: "PIECE_REMPLACEE", label: "Pièce remplacée" },
  { value: "AUTRE", label: "Autre" },
];

function formatHM(hours: number | null): string {
  if (hours == null) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function defaultCategory(row: ParsedRow): KardexCategory {
  if (row.cnNumber) return "CONSIGNE_NAVIGABILITE";
  if (row.act === "REMP") return "PIECE_REMPLACEE";
  return "VISITE";
}

function toReviewRow(row: ParsedRow, sheetName: string, index: number): ReviewRow {
  return {
    ...row,
    key: `${sheetName}-${index}`,
    include: row.suggestedInclude,
    category: defaultCategory(row),
  };
}

// Import du Kardex existant (papier/Excel) pour un avion — voir
// src/lib/kardex-import.ts pour le détail du parsing. Deux temps,
// volontairement : (1) le fichier est lu et structuré, sans aucune
// écriture ; (2) l'utilisateur choisit les feuilles à jour et relit/ajuste
// chaque ligne avant de confirmer. Rien n'atterrit en base sans être passé
// par cet écran de relecture — des données de navigabilité importées à
// tort seraient trop lourdes de conséquences pour se fier à un parsing
// automatique seul.
export function KardexImportModal({
  aircraftId,
  aircraftRegistration,
  onClose,
  onImported,
}: {
  aircraftId: string;
  aircraftRegistration: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [kardexSheetName, setKardexSheetName] = useState("");
  const [statutSheetName, setStatutSheetName] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ maintenanceRecordsCreated: number; kardexEntriesCreated: number } | null>(
    null
  );

  const kardexSheets = useMemo(() => sheets.filter((s) => s.kind === "kardex"), [sheets]);
  const statutSheets = useMemo(() => sheets.filter((s) => s.kind === "statut"), [sheets]);

  // Prend la liste de feuilles en paramètre plutôt que de fermer sur l'état
  // `sheets` : appelée juste après un setSheets() (handleFile), l'état
  // React n'est pas encore à jour à ce moment précis dans la même
  // exécution — sans ce paramètre explicite, la toute première relecture
  // après un envoi de fichier se retrouvait avec un tableau vide.
  function buildRows(sheetsList: ParsedSheet[], kName: string, sName: string) {
    const k = sheetsList.find((s) => s.name === kName);
    const s = sheetsList.find((s2) => s2.name === sName);
    const combined = [
      ...(k ? k.rows.map((r, i) => toReviewRow(r, `k-${kName}`, i)) : []),
      ...(s ? s.rows.map((r, i) => toReviewRow(r, `s-${sName}`, i)) : []),
    ];
    setRows(combined);
  }

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/kardex/import/parse", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
      const parsedSheets: ParsedSheet[] = data.sheets;
      setSheets(parsedSheets);
      const firstKardex = parsedSheets.find((sh) => sh.kind === "kardex")?.name ?? "";
      const firstStatut = parsedSheets.find((sh) => sh.kind === "statut")?.name ?? "";
      setKardexSheetName(firstKardex);
      setStatutSheetName(firstStatut);
      buildRows(parsedSheets, firstKardex, firstStatut);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUploading(false);
    }
  }

  function changeKardexSheet(name: string) {
    setKardexSheetName(name);
    buildRows(sheets, name, statutSheetName);
  }
  function changeStatutSheet(name: string) {
    setStatutSheetName(name);
    buildRows(sheets, kardexSheetName, name);
  }

  function toggleRow(key: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, include: !r.include } : r)));
  }
  function setRowCategory(key: string, category: KardexCategory) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, category } : r)));
  }
  function toggleAll(include: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, include })));
  }

  const includedCount = rows.filter((r) => r.include).length;

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/kardex/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aircraftId,
          rows: rows
            .filter((r) => r.include)
            .map((r) => ({
              cnNumber: r.cnNumber,
              label: r.label,
              category: r.category,
              appliedDate: r.appliedDate,
              appliedHours: r.appliedHours,
              dueDate: r.dueDate,
              dueHours: r.dueHours,
              notes: r.notes,
            })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
      setResult(data);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-navy-900">Importer le Kardex — {aircraftRegistration}</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {step === "upload" && (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-navy-600">
              Dépose le classeur Excel du Kardex de cet avion (.xls ou .xlsx). Les onglets dont le
              nom contient « KARDEX » (interventions) ou « STATUT » (consignes de navigabilité)
              sont reconnus automatiquement — rien n&apos;est encore enregistré à cette étape, tu
              choisiras et relira les lignes ensuite.
            </p>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-navy-200 rounded-xl py-10 cursor-pointer hover:border-sunset-400 hover:bg-navy-50/50 transition-colors">
              <FileUp size={28} className="text-navy-400" />
              <span className="text-sm font-medium text-navy-700">
                {uploading ? "Lecture du fichier..." : "Choisir un fichier Excel"}
              </span>
              <span className="text-xs text-navy-400">.xls ou .xlsx — 4 Mo max</span>
              <input
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={uploading}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          </div>
        )}

        {step === "review" && (
          <div className="p-5 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-navy-600">
                  Feuille interventions (KARDEX)
                </span>
                <select
                  value={kardexSheetName}
                  onChange={(e) => changeKardexSheet(e.target.value)}
                  className="input"
                >
                  <option value="">— aucune —</option>
                  {kardexSheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name.trim()} ({s.rows.length})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-navy-600">
                  Feuille consignes de navigabilité (STATUT)
                </span>
                <select
                  value={statutSheetName}
                  onChange={(e) => changeStatutSheet(e.target.value)}
                  className="input"
                >
                  <option value="">— aucune —</option>
                  {statutSheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name.trim()} ({s.rows.length})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-xs text-navy-500 -mt-1">
              La sélection ci-dessous est une suggestion (une échéance récurrente identifiée =
              coché) — relis et ajuste avant de confirmer, y compris la catégorie. Rien n&apos;est
              encore enregistré.
            </p>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => toggleAll(true)} className="text-sunset-600 hover:underline">
                  Tout cocher
                </button>
                <button type="button" onClick={() => toggleAll(false)} className="text-navy-500 hover:underline">
                  Tout décocher
                </button>
              </div>
              <span className="text-navy-600 font-medium">
                {includedCount} / {rows.length} ligne(s) sélectionnée(s)
              </span>
            </div>

            <div className="border border-navy-100 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[45vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-navy-50 sticky top-0">
                    <tr className="text-left text-navy-600">
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2 font-medium">N° CN</th>
                      <th className="px-3 py-2 font-medium">Libellé</th>
                      <th className="px-3 py-2 font-medium">Catégorie</th>
                      <th className="px-3 py-2 font-medium">Appliqué</th>
                      <th className="px-3 py-2 font-medium">Échéance</th>
                      <th className="px-3 py-2 font-medium">Observations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {rows.map((r) => (
                      <tr key={r.key} className={clsxRow(r.include)}>
                        <td className="px-3 py-2 align-top">
                          <input type="checkbox" checked={r.include} onChange={() => toggleRow(r.key)} />
                        </td>
                        <td className="px-3 py-2 align-top text-navy-500 whitespace-nowrap">{r.cnNumber ?? "—"}</td>
                        <td className="px-3 py-2 align-top text-navy-900 font-medium max-w-[220px]">{r.label}</td>
                        <td className="px-3 py-2 align-top">
                          <select
                            value={r.category}
                            onChange={(e) => setRowCategory(r.key, e.target.value as KardexCategory)}
                            className="text-xs border border-navy-100 rounded-md px-1.5 py-1"
                          >
                            {CATEGORY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top text-navy-600 whitespace-nowrap">
                          {r.appliedDate ?? "—"}
                          {r.appliedHours != null ? ` · ${formatHM(r.appliedHours)}` : ""}
                        </td>
                        <td className="px-3 py-2 align-top text-navy-600 whitespace-nowrap">
                          {r.dueDate ?? "—"}
                          {r.dueHours != null ? ` · ${formatHM(r.dueHours)}` : ""}
                        </td>
                        <td className="px-3 py-2 align-top text-navy-500 max-w-[220px]">{r.notes ?? ""}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-navy-500">
                          Choisis au moins une feuille ci-dessus.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setStep("upload")} className="text-sm text-navy-600 hover:text-navy-900">
                ← Choisir un autre fichier
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || includedCount === 0}
                className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm transition-colors disabled:opacity-60"
              >
                <Upload size={15} />
                {importing ? "Import..." : `Importer ${includedCount} ligne(s)`}
              </button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-navy-800 bg-green-100 text-green-700 rounded-lg px-3 py-3">
              Import terminé : {result.maintenanceRecordsCreated} échéance(s) de maintenance et{" "}
              {result.kardexEntriesCreated} entrée(s) au kardex créées.
            </p>
            <button
              type="button"
              onClick={onImported}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm transition-colors self-end"
            >
              Fermer et actualiser
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function clsxRow(included: boolean): string {
  return included ? "bg-white" : "bg-navy-50/50 opacity-60";
}
