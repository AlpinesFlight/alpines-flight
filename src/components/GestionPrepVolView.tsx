"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { FlightPrepDocument } from "@/types/models";
import { formatDateTime } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import {
  CloudSun,
  Map as MapIcon,
  Radar,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Plus,
  X,
  Trash2,
  Upload,
  Camera,
} from "lucide-react";

// Terrain de base de l'école (LFNA, Gap-Tallard — voir src/lib/sun-times.ts)
// : sert à centrer par défaut la carte Windy et le lien Géoportail, pour
// arriver directement sur la zone utile plutôt que sur une vue par défaut
// quelconque.
const HOME_LAT = 44.454;
const HOME_LON = 6.037;

// Widget officiel embed.windy.com (vérifié en direct — seul service des
// trois à proposer une intégration inline réelle ; Aéroweb et SOFIA
// Briefing exigent une connexion personnelle et bloquent l'affichage en
// iframe comme la plupart des services officiels de ce type).
const WINDY_EMBED_URL =
  `https://embed.windy.com/embed2.html?lat=${HOME_LAT}&lon=${HOME_LON}` +
  `&detailLat=${HOME_LAT}&detailLon=${HOME_LON}&width=650&height=450&zoom=9` +
  `&level=surface&overlay=wind&product=ecmwf&menu=&message=true&marker=true` +
  `&calendar=now&pressure=&type=map&location=coordinates&detail=` +
  `&metricWind=default&metricTemp=default&radarRange=-1`;

const EXTERNAL_TOOLS = [
  {
    key: "aeroweb",
    label: "Aéroweb",
    description: "Météo-France — dossier de vol, TEMSI, METAR/TAF (identifiants personnels requis)",
    href: "https://aviation.meteo.fr/",
    icon: CloudSun,
  },
  {
    key: "sofia",
    label: "SOFIA Briefing",
    description: "DGAC/DSNA — NOTAM, Atlas VAC, dépôt de plan de vol",
    href: "https://sofia-briefing.aviation-civile.gouv.fr/sofia/pages/prepavol.html",
    icon: Radar,
  },
  {
    key: "geoportail",
    label: "Carte OACI 1/500 000",
    description: "Géoportail (IGN) — centrée sur Gap-Tallard",
    href: `https://www.geoportail.gouv.fr/carte?c=${HOME_LON}%2C${HOME_LAT}&z=10&l0=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN-OACI%3A%3AGEOPORTAIL%3AOGC%3AWMTS%281%29&permalink=yes`,
    icon: MapIcon,
  },
];

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function GestionPrepVolView() {
  const [documents, setDocuments] = useState<FlightPrepDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<FlightPrepDocument[]>("/api/flight-prep-documents");
      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(doc: FlightPrepDocument) {
    if (!window.confirm(`Supprimer définitivement « ${doc.title} » ?`)) return;
    await apiFetch(`/api/flight-prep-documents/${doc.id}`, { method: "DELETE" });
    load();
  }

  // Regroupe par catégorie (ex: "Masse et centrage", "Performances", une
  // immatriculation...) — les documents sans catégorie passent dans "Autres".
  const groups = new Map<string, FlightPrepDocument[]>();
  for (const doc of documents) {
    const key = doc.category || "Autres";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  return (
    <div>
      <GestionPageHeader
        title="Préparation de vol"
        subtitle="Météo, NOTAM, cartes et documents utiles — tout au même endroit"
      />
      <div className="px-4 md:px-10 pb-10 flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-navy-900 border border-navy-700 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-navy-700">
              <h2 className="font-semibold text-cream-50">Vent (Windy)</h2>
              <a
                href={`https://www.windy.com/?${HOME_LAT},${HOME_LON},9`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-navy-100/50 hover:text-cream-50 transition-colors"
              >
                Plein écran <ExternalLink size={12} />
              </a>
            </div>
            <iframe
              src={WINDY_EMBED_URL}
              title="Carte des vents Windy — Gap-Tallard"
              className="w-full h-[420px] border-0"
            />
          </div>

          <div className="flex flex-col gap-3">
            {EXTERNAL_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <a
                  key={tool.key}
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 bg-navy-900 border border-navy-700 hover:border-sunset-500/50 hover:bg-navy-800 rounded-2xl px-4 py-3.5 transition-colors group"
                >
                  <div className="mt-0.5 shrink-0 rounded-lg bg-navy-800 group-hover:bg-navy-700 p-2 text-sunset-500 transition-colors">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-cream-50 flex items-center gap-1.5">
                      {tool.label}
                      <ExternalLink size={12} className="text-navy-100/40" />
                    </p>
                    <p className="text-xs text-navy-100/50 mt-0.5">{tool.description}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        <div className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-navy-700">
            <h2 className="font-semibold text-cream-50">Documents utiles</h2>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
            >
              <Plus size={15} /> Ajouter
            </button>
          </div>

          {!loading && documents.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-navy-100/50">
              Aucun document pour l&apos;instant — masse et centrage, performances...
            </div>
          )}

          {Array.from(groups.entries()).map(([category, docs]) => (
            <div key={category} className="border-b border-navy-800 last:border-b-0">
              <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-100/40">
                {category}
              </p>
              <div className="divide-y divide-navy-800">
                {docs.map((doc) => (
                  <DocRow key={doc.id} doc={doc} onDelete={() => handleDelete(doc)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function DocRow({ doc, onDelete }: { doc: FlightPrepDocument; onDelete: () => void }) {
  const Icon = doc.fileMimeType.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <a
        href={`/api/flight-prep-documents/${doc.id}/file`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 min-w-0 group"
      >
        <Icon size={18} className="text-navy-100/40 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-cream-50 truncate group-hover:underline">{doc.title}</p>
          <p className="text-xs text-navy-100/45">
            {formatSize(doc.fileSize)} · importé le {formatDateTime(doc.uploadedAt)} par {doc.uploadedBy.firstName}
          </p>
        </div>
      </a>
      <button onClick={onDelete} title="Supprimer définitivement" className="text-navy-100/40 hover:text-red-400 shrink-0">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

const CATEGORY_SUGGESTIONS = ["Masse et centrage", "Performances", "Cartes", "Procédures", "Autres"];

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handlePick(f: File | undefined) {
    if (!f) return;
    setError(null);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.\w+$/, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choisis un fichier PDF ou une image.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", title || file.name);
      form.set("category", category);
      form.set("file", file);

      const res = await fetch("/api/flight-prep-documents", { method: "POST", body: form });
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700 sticky top-0 bg-navy-900">
          <h2 className="font-semibold text-cream-50">Ajouter un document</h2>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-navy-700 hover:border-sunset-500 hover:bg-sunset-500/10 py-4 text-navy-100/70 transition-colors"
            >
              <Upload size={20} />
              <span className="text-xs font-semibold">Importer un fichier</span>
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-navy-700 hover:border-sunset-500 hover:bg-sunset-500/10 py-4 text-navy-100/70 transition-colors"
            >
              <Camera size={20} />
              <span className="text-xs font-semibold">Prendre une photo</span>
            </button>
          </div>
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => handlePick(e.target.files?.[0])}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handlePick(e.target.files?.[0])}
          />

          {file && (
            <p className="text-xs text-navy-100/70 bg-navy-800 rounded-lg px-3 py-2">
              {file.name} · {formatSize(file.size)}
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Titre</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-dark" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Catégorie (optionnel)</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-dark"
              list="flight-prep-doc-categories"
              placeholder="Masse et centrage..."
            />
            <datalist id="flight-prep-doc-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          {error && <p className="text-red-400 text-sm bg-red-500/15 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Envoi..." : "Ajouter"}
          </button>
        </form>
      </div>
    </div>
  );
}
