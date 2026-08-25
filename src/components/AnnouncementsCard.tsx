"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { Announcement } from "@/types/models";
import { formatDateTime } from "@/lib/format";
import { Megaphone, Plus, X, Paperclip, Trash2, FileText } from "lucide-react";

export function AnnouncementsCard() {
  const { data: session } = useSession();
  const canManage = session?.user?.role === "GERANT" || session?.user?.role === "ADMIN";
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<Announcement[]>("/api/announcements");
      setAnnouncements(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer cette actualité ?")) return;
    await apiFetch(`/api/announcements/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
        <h2 className="flex items-center gap-2 font-semibold text-navy-900">
          <Megaphone size={16} className="text-sunset-600" /> Actualités
        </h2>
        {canManage && (
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-sunset-600 hover:underline"
          >
            <Plus size={14} /> Publier
          </button>
        )}
      </div>

      <div className="divide-y divide-navy-100 max-h-[420px] overflow-y-auto">
        {!loading && announcements.length === 0 && (
          <p className="px-5 py-6 text-sm text-navy-600">Aucune actualité pour l&apos;instant.</p>
        )}
        {announcements.map((a) => (
          <div key={a.id} className="px-5 py-4 group">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-navy-900">{a.title}</p>
              {canManage && (
                <button
                  onClick={() => handleDelete(a.id)}
                  title="Supprimer"
                  className="text-navy-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <p className="text-sm text-navy-700 whitespace-pre-wrap mt-1">{a.body}</p>
            {a.attachments.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                {a.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/api/announcements/${a.id}/attachments/${att.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-sunset-600 hover:underline w-fit"
                  >
                    <Paperclip size={12} /> {att.fileName}
                  </a>
                ))}
              </div>
            )}
            <p className="text-[11px] text-navy-400 mt-2">
              {a.createdBy.firstName} {a.createdBy.lastName} · {formatDateTime(a.createdAt)}
            </p>
          </div>
        ))}
      </div>

      {showCompose && (
        <ComposeAnnouncementModal
          onClose={() => setShowCompose(false)}
          onCreated={() => {
            setShowCompose(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ComposeAnnouncementModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)].slice(0, 5));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("body", body);
      for (const file of files) form.append("files", file);

      const res = await fetch("/api/announcements", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ? String(data.error) : `Erreur ${res.status}`);
      }
      onCreated();
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
          <h2 className="font-semibold text-navy-900">Publier une actualité</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <p className="text-xs text-navy-600 -mt-1">
            Visible immédiatement par tous les comptes sur le tableau de bord.
          </p>
          <input
            required
            placeholder="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
          <textarea
            required
            placeholder="Texte de l'actualité"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input min-h-28"
          />

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">
              Documents joints (optionnel, 5 max, PDF/image/Word/Excel — 10 Mo max chacun)
            </span>
            <input
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              className="text-sm"
            />
          </label>

          {files.length > 0 && (
            <div className="flex flex-col gap-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-navy-50 rounded-lg px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5 text-navy-700 truncate">
                    <FileText size={12} /> {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-navy-400 hover:text-red-600 shrink-0 ml-2"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Publication..." : "Publier"}
          </button>
        </form>
      </div>
    </div>
  );
}
