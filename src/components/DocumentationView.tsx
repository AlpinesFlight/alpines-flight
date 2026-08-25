"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { DocumentVisibility, SchoolDocument } from "@/types/models";
import { formatDate } from "@/lib/format";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";
import { FileText, Plus, X, Trash2, FolderOpen, Lock } from "lucide-react";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function DocumentationView() {
  const { data: session, status: sessionStatus } = useSession();
  const canManage = canManageSchool(session?.user?.role);
  const isStaff = isInstructorOrAbove(session?.user?.role);
  const [documents, setDocuments] = useState<SchoolDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<SchoolDocument[]>("/api/documents");
      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "loading") return;
    load();
  }, [sessionStatus]);

  async function handleDelete(doc: SchoolDocument) {
    if (!window.confirm(`Supprimer « ${doc.title} » ?`)) return;
    await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    load();
  }

  const grouped = useMemo(() => {
    const map = new Map<string, SchoolDocument[]>();
    for (const d of documents) {
      const key = d.category ?? "Autres";
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [documents]);

  return (
    <div className="p-8">
      <div className="flex justify-end mb-5">
        {canManage && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Ajouter un document
          </button>
        )}
      </div>

      {!loading && documents.length === 0 && (
        <div className="bg-white rounded-2xl border border-navy-100 p-8 text-center text-sm text-navy-600">
          Aucun document pour l&apos;instant.
        </div>
      )}

      {grouped.map(([category, docs]) => (
        <div key={category} className="bg-white rounded-2xl border border-navy-100 overflow-hidden mb-5">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-navy-100">
            <FolderOpen size={16} className="text-sunset-600" />
            <h2 className="font-semibold text-navy-900">{category}</h2>
          </div>
          <div className="divide-y divide-navy-100">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <a
                  href={`/api/documents/${d.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 min-w-0 group"
                >
                  <FileText size={18} className="text-navy-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate group-hover:underline">
                      {d.title}
                    </p>
                    <p className="text-xs text-navy-500">
                      {d.fileName} · {formatSize(d.fileSize)} · importé le {formatDate(d.uploadedAt)} par{" "}
                      {d.uploadedBy.firstName} {d.uploadedBy.lastName}
                    </p>
                  </div>
                </a>
                <div className="flex items-center gap-3 shrink-0">
                  {isStaff && d.visibility === "FI_ONLY" && (
                    <span
                      title="Visible du staff pédagogique uniquement"
                      className="flex items-center gap-1 text-[11px] font-semibold text-navy-500 bg-navy-100 px-2 py-1 rounded-full"
                    >
                      <Lock size={11} /> FI
                    </span>
                  )}
                  {canManage && (
                    <button
                      onClick={() => handleDelete(d)}
                      title="Supprimer"
                      className="text-navy-400 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

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

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState<DocumentVisibility>("ALL");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choisis un fichier.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("category", category);
      form.set("visibility", visibility);
      form.set("file", file);

      const res = await fetch("/api/documents", { method: "POST", body: form });
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
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">Ajouter un document</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Titre</span>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">
              Catégorie (optionnel — ex : Procédures, Manuels avion, Réglementation)
            </span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} className="input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Visible par</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}
              className="input"
            >
              <option value="ALL">Tout le monde (élèves, pilotes, FI)</option>
              <option value="FI_ONLY">Staff pédagogique uniquement (FI et au-dessus)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">
              Fichier (PDF, image, Word ou Excel — 20 Mo max)
            </span>
            <input
              type="file"
              required
              accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx,.xls,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
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
