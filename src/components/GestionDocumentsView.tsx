"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { apiFetch } from "@/lib/api";
import { AdminDocument } from "@/types/models";
import { formatDateTime } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import {
  FileText,
  Image as ImageIcon,
  Plus,
  X,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Camera,
  Upload,
} from "lucide-react";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Même valeur que côté serveur (voir /api/admin/documents/blob-upload) —
// rejeter tout de suite au choix du fichier évite un envoi pour rien.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function GestionDocumentsView() {
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showProcessed, setShowProcessed] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<AdminDocument[]>("/api/admin/documents");
      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(doc: AdminDocument) {
    await apiFetch(`/api/admin/documents/${doc.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: doc.status === "PENDING" ? "PROCESSED" : "PENDING" }),
    });
    load();
  }

  async function handleDelete(doc: AdminDocument) {
    if (!window.confirm(`Supprimer définitivement « ${doc.title} » ?`)) return;
    await apiFetch(`/api/admin/documents/${doc.id}`, { method: "DELETE" });
    load();
  }

  const pending = documents.filter((d) => d.status === "PENDING");
  const processed = documents.filter((d) => d.status === "PROCESSED");

  return (
    <div>
      <GestionPageHeader
        title="Documents"
        subtitle="Factures, relevés et notes de frais à transmettre au comptable"
        action={
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Ajouter un document
          </button>
        }
      />
      <div className="px-4 md:px-10 pb-10">
      <p className="text-sm text-navy-100/60 mb-4">
        <span className="font-semibold text-cream-50">{pending.length}</span> document{pending.length !== 1 ? "s" : ""} à traiter
      </p>

      {!loading && documents.length === 0 && (
        <div className="bg-navy-900 rounded-2xl border border-navy-700 p-8 text-center text-sm text-navy-100/50">
          Aucun document pour l&apos;instant. Ajoute une facture, un relevé ou une note de frais en PDF ou en photo.
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden mb-5">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-navy-700">
            <h2 className="font-semibold text-cream-50">À traiter</h2>
          </div>
          <div className="divide-y divide-navy-800">
            {pending.map((d) => (
              <DocRow key={d.id} doc={d} onToggle={() => toggleStatus(d)} onDelete={() => handleDelete(d)} />
            ))}
          </div>
        </div>
      )}

      {processed.length > 0 && (
        <div className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden">
          <button
            onClick={() => setShowProcessed((s) => !s)}
            className="w-full flex items-center justify-between gap-2 px-5 py-3 border-b border-navy-700 text-left"
          >
            <h2 className="font-semibold text-cream-50">Traités ({processed.length})</h2>
            <span className="text-xs text-navy-100/40">{showProcessed ? "Masquer" : "Afficher"}</span>
          </button>
          {showProcessed && (
            <div className="divide-y divide-navy-800">
              {processed.map((d) => (
                <DocRow key={d.id} doc={d} onToggle={() => toggleStatus(d)} onDelete={() => handleDelete(d)} />
              ))}
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}

function DocRow({ doc, onToggle, onDelete }: { doc: AdminDocument; onToggle: () => void; onDelete: () => void }) {
  const Icon = doc.fileMimeType.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <a
        href={`/api/admin/documents/${doc.id}/file`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 min-w-0 group"
      >
        <Icon size={18} className="text-navy-100/40 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-cream-50 truncate group-hover:underline">{doc.title}</p>
          <p className="text-xs text-navy-100/45">
            {doc.category ? `${doc.category} · ` : ""}
            {formatSize(doc.fileSize)} · importé le {formatDateTime(doc.uploadedAt)} par {doc.uploadedBy.firstName}
          </p>
        </div>
      </a>
      <div className="flex items-center gap-3 shrink-0">
        {doc.status === "PENDING" ? (
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-[11px] font-semibold text-navy-100/70 hover:text-green-400 bg-navy-800 hover:bg-green-500/15 px-2 py-1 rounded-full transition-colors"
          >
            <CheckCircle2 size={12} /> Marquer traité
          </button>
        ) : (
          <button
            onClick={onToggle}
            title="Remettre à traiter"
            className="flex items-center gap-1 text-[11px] font-semibold text-green-400 bg-green-500/15 hover:bg-navy-800 hover:text-navy-100/70 px-2 py-1 rounded-full transition-colors"
          >
            <RotateCcw size={12} /> Traité
          </button>
        )}
        <button onClick={onDelete} title="Supprimer définitivement" className="text-navy-100/40 hover:text-red-400">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

const CATEGORY_SUGGESTIONS = ["Facture fournisseur", "Relevé bancaire", "Note de frais", "Facture client", "Autre"];

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Pourcentage d'envoi (upload direct vers Blob, potentiellement gros sur
  // mobile) ; null tant qu'il n'y a rien en cours.
  const [progress, setProgress] = useState<number | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handlePick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError(`Fichier trop volumineux (${formatSize(MAX_FILE_BYTES)} max).`);
      return;
    }
    setError(null);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.\w+$/, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choisis un fichier PDF ou prends une photo.");
      return;
    }
    setSaving(true);
    setProgress(0);
    setError(null);
    try {
      // 1) Envoi direct du navigateur vers Vercel Blob — contourne la limite
      // dure de 4,5 Mo sur le corps d'une requête serverless (voir
      // /api/admin/documents/blob-upload, qui émet le jeton d'upload).
      const blob = await upload(`admin-documents/${Date.now()}-${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/documents/blob-upload",
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });
      // 2) La fiche elle-même, une fois le fichier bien arrivé dans Blob.
      await apiFetch("/api/admin/documents", {
        method: "POST",
        body: JSON.stringify({
          title: title || file.name,
          category: category || null,
          fileName: file.name,
          blobUrl: blob.url,
        }),
      });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
      setProgress(null);
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
          {/* capture="environment" : ouvre directement l'appareil photo sur
              mobile plutôt que la galerie — c'est ce qui fait la différence
              avec le bouton "Importer un fichier" ci-dessus. */}
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
          {progress !== null && (
            <p className="text-xs text-navy-100/50">Envoi... {Math.round(progress)} %</p>
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
              list="admin-doc-categories"
              placeholder="Facture fournisseur..."
            />
            <datalist id="admin-doc-categories">
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
