"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { AdminDocument } from "@/types/models";
import { formatDateTime } from "@/lib/format";
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
  ShieldAlert,
} from "lucide-react";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Réduit une photo prise depuis l'appareil (souvent 3 à 12 Mo en pleine
// résolution) avant envoi — sans ça, une bonne partie des photos dépasserait
// la limite de 4 Mo côté serveur (voir MAX_FILE_BYTES, /api/admin/documents)
// et donc la limite dure de 4,5 Mo de Vercel sur le corps d'une requête. Un
// PDF n'a pas ce problème (déjà compact) et n'est jamais touché ici.
async function compressIfImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1800;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Best-effort : si la compression échoue pour une raison quelconque
    // (navigateur trop ancien...), le fichier original part tel quel — la
    // vérification de taille côté serveur reste le garde-fou final.
    return file;
  }
}

export function GestionDocumentsView() {
  const { data: session, status: sessionStatus } = useSession();
  const isGerant = session?.user?.role === "GERANT";
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
    if (sessionStatus === "loading" || !isGerant) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, isGerant]);

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

  if (sessionStatus !== "loading" && !isGerant) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 flex flex-col items-center text-center gap-2 max-w-md mx-auto mt-8">
          <ShieldAlert size={28} className="text-navy-400" />
          <p className="font-semibold text-navy-900">Accès réservé au Gérant</p>
          <p className="text-sm text-navy-600">La plateforme de gestion n&apos;est visible que du compte Gérant.</p>
        </div>
      </div>
    );
  }

  const pending = documents.filter((d) => d.status === "PENDING");
  const processed = documents.filter((d) => d.status === "PROCESSED");

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center flex-wrap gap-3 mb-5">
        <div>
          <p className="text-sm text-navy-600">
            <span className="font-semibold text-navy-900">{pending.length}</span> document{pending.length !== 1 ? "s" : ""} à traiter
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Ajouter un document
        </button>
      </div>

      {!loading && documents.length === 0 && (
        <div className="bg-white rounded-2xl border border-navy-100 p-8 text-center text-sm text-navy-600">
          Aucun document pour l&apos;instant. Ajoute une facture, un relevé ou une note de frais en PDF ou en photo.
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden mb-5">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-navy-100">
            <h2 className="font-semibold text-navy-900">À traiter</h2>
          </div>
          <div className="divide-y divide-navy-100">
            {pending.map((d) => (
              <DocRow key={d.id} doc={d} onToggle={() => toggleStatus(d)} onDelete={() => handleDelete(d)} />
            ))}
          </div>
        </div>
      )}

      {processed.length > 0 && (
        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
          <button
            onClick={() => setShowProcessed((s) => !s)}
            className="w-full flex items-center justify-between gap-2 px-5 py-3 border-b border-navy-100 text-left"
          >
            <h2 className="font-semibold text-navy-900">Traités ({processed.length})</h2>
            <span className="text-xs text-navy-500">{showProcessed ? "Masquer" : "Afficher"}</span>
          </button>
          {showProcessed && (
            <div className="divide-y divide-navy-100">
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
        <Icon size={18} className="text-navy-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy-900 truncate group-hover:underline">{doc.title}</p>
          <p className="text-xs text-navy-500">
            {doc.category ? `${doc.category} · ` : ""}
            {formatSize(doc.fileSize)} · importé le {formatDateTime(doc.uploadedAt)} par {doc.uploadedBy.firstName}
          </p>
        </div>
      </a>
      <div className="flex items-center gap-3 shrink-0">
        {doc.status === "PENDING" ? (
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-[11px] font-semibold text-navy-600 hover:text-green-700 bg-navy-50 hover:bg-green-100 px-2 py-1 rounded-full transition-colors"
          >
            <CheckCircle2 size={12} /> Marquer traité
          </button>
        ) : (
          <button
            onClick={onToggle}
            title="Remettre à traiter"
            className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 hover:bg-navy-100 hover:text-navy-600 px-2 py-1 rounded-full transition-colors"
          >
            <RotateCcw size={12} /> Traité
          </button>
        )}
        <button onClick={onDelete} title="Supprimer définitivement" className="text-navy-400 hover:text-red-600">
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
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handlePick(f: File | undefined) {
    if (!f) return;
    setError(null);
    setCompressing(true);
    try {
      const compressed = await compressIfImage(f);
      setFile(compressed);
      if (!title) setTitle(f.name.replace(/\.\w+$/, ""));
    } finally {
      setCompressing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choisis un fichier PDF ou prends une photo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", title || file.name);
      form.set("category", category);
      form.set("file", file);

      const res = await fetch("/api/admin/documents", { method: "POST", body: form });
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
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">Ajouter un document</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-navy-200 hover:border-sunset-400 hover:bg-sunset-50 py-4 text-navy-700 transition-colors"
            >
              <Upload size={20} />
              <span className="text-xs font-semibold">Importer un fichier</span>
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-navy-200 hover:border-sunset-400 hover:bg-sunset-50 py-4 text-navy-700 transition-colors"
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

          {compressing && <p className="text-xs text-navy-500">Compression de la photo...</p>}
          {file && !compressing && (
            <p className="text-xs text-navy-600 bg-navy-50 rounded-lg px-3 py-2">
              {file.name} · {formatSize(file.size)}
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Titre</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Catégorie (optionnel)</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input"
              list="admin-doc-categories"
              placeholder="Facture fournisseur..."
            />
            <datalist id="admin-doc-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving || compressing}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Envoi..." : "Ajouter"}
          </button>
        </form>
      </div>
    </div>
  );
}
