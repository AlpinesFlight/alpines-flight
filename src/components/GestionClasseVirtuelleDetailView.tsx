"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { TheoryClass, TheoryClassDocument } from "@/types/models";
import { formatDateTime } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import {
  ArrowLeft,
  Video,
  Copy,
  Check,
  Info,
  Pencil,
  Trash2,
  Plus,
  X,
  FileText,
  Image as ImageIcon,
  Upload,
  Camera,
} from "lucide-react";

function roomUrl(slug: string) {
  return `https://meet.jit.si/${slug}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function GestionClasseVirtuelleDetailView({ classId }: { classId: string }) {
  const router = useRouter();
  const [theoryClass, setTheoryClass] = useState<TheoryClass | null>(null);
  const [copied, setCopied] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  async function load() {
    const data = await apiFetch<TheoryClass>(`/api/theory-classes/${classId}`);
    setTheoryClass(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function copyLink() {
    if (!theoryClass) return;
    try {
      await navigator.clipboard.writeText(roomUrl(theoryClass.roomSlug));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Best-effort — le lien reste consultable directement dans la carte.
    }
  }

  async function handleDeleteClass() {
    if (!theoryClass) return;
    if (!window.confirm(`Supprimer définitivement la classe « ${theoryClass.title} » et ses documents ?`)) return;
    await apiFetch(`/api/theory-classes/${classId}`, { method: "DELETE" });
    router.push("/gestion/classes-virtuelles");
  }

  async function handleDeleteDoc(doc: TheoryClassDocument) {
    if (!window.confirm(`Supprimer définitivement « ${doc.fileName} » ?`)) return;
    await apiFetch(`/api/theory-classes/${classId}/documents/${doc.id}`, { method: "DELETE" });
    load();
  }

  if (!theoryClass) {
    return <div className="px-4 md:px-10 py-10 text-navy-100/50 text-sm">Chargement...</div>;
  }

  const url = roomUrl(theoryClass.roomSlug);

  return (
    <div>
      <GestionPageHeader
        title={theoryClass.title}
        subtitle={theoryClass.description || undefined}
        action={
          <Link
            href="/gestion/classes-virtuelles"
            className="flex items-center gap-1.5 text-sm text-navy-100/60 hover:text-cream-50 transition-colors"
          >
            <ArrowLeft size={16} /> Retour aux classes
          </Link>
        }
      />
      <div className="px-4 md:px-10 pb-10 flex flex-col gap-5">
        <div className="bg-navy-900 rounded-2xl border border-navy-700 p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-cream-50">Salle de visio</h2>
              <p className="text-sm text-navy-100/50 mt-0.5">
                Toujours la même adresse pour cette classe — partage-la une fois pour toutes au FI et aux élèves
                concernés.
              </p>
            </div>
            <button onClick={() => setShowEdit(true)} title="Modifier" className="text-navy-100/50 hover:text-cream-50 shrink-0">
              <Pencil size={15} />
            </button>
          </div>
          <p className="text-xs text-navy-100/70 bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 truncate font-mono">
            {url}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
            >
              <Video size={16} /> Démarrer
            </a>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-navy-100 text-sm font-semibold px-3.5 py-2 transition-colors"
            >
              {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
              {copied ? "Copié" : "Copier le lien"}
            </button>
            <button
              onClick={handleDeleteClass}
              className="flex items-center gap-1.5 rounded-lg text-navy-100/50 hover:text-red-400 text-sm px-2 py-2 transition-colors ml-auto"
            >
              <Trash2 size={14} /> Supprimer la classe
            </button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-navy-100/40">
            <Info size={13} className="shrink-0 mt-0.5" />
            Gratuit, sans compte (Jitsi Meet) — le lien s&apos;ouvre dans un nouvel onglet, sans limite de durée
            (Jitsi limite à 5 minutes tout appel intégré directement dans une page).
          </p>
        </div>

        <div className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-navy-700">
            <h2 className="font-semibold text-cream-50">Documents de cours</h2>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
            >
              <Plus size={15} /> Ajouter
            </button>
          </div>
          {(theoryClass.documents?.length ?? 0) === 0 && (
            <div className="px-5 py-8 text-center text-sm text-navy-100/50">
              Aucun document pour l&apos;instant — supports de cours, exercices...
            </div>
          )}
          <div className="divide-y divide-navy-800">
            {theoryClass.documents?.map((doc) => (
              <DocRow key={doc.id} classId={classId} doc={doc} onDelete={() => handleDeleteDoc(doc)} />
            ))}
          </div>
        </div>
      </div>

      {showEdit && (
        <EditModal
          theoryClass={theoryClass}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            load();
          }}
        />
      )}
      {showUpload && (
        <UploadModal
          classId={classId}
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

function DocRow({ classId, doc, onDelete }: { classId: string; doc: TheoryClassDocument; onDelete: () => void }) {
  const Icon = doc.fileMimeType.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <a
        href={`/api/theory-classes/${classId}/documents/${doc.id}/file`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 min-w-0 group"
      >
        <Icon size={18} className="text-navy-100/40 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-cream-50 truncate group-hover:underline">{doc.fileName}</p>
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

function EditModal({
  theoryClass,
  onClose,
  onSaved,
}: {
  theoryClass: TheoryClass;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(theoryClass.title);
  const [description, setDescription] = useState(theoryClass.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/theory-classes/${theoryClass.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, description: description || null }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-cream-50">Modifier la classe</h2>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="input-dark" />
          <textarea
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-dark min-h-16"
          />
          {error && <p className="text-red-400 text-sm bg-red-500/15 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}

function UploadModal({ classId, onClose, onUploaded }: { classId: string; onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
      form.set("file", file);
      const res = await fetch(`/api/theory-classes/${classId}/documents`, { method: "POST", body: form });
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
      <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700">
          <h2 className="font-semibold text-cream-50">Ajouter un document de cours</h2>
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
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="text-xs text-navy-100/70 bg-navy-800 rounded-lg px-3 py-2">
              {file.name} · {formatSize(file.size)}
            </p>
          )}
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
