"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { AdminNote } from "@/types/models";
import { formatDateTime } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import { Plus, X, Trash2, Pin, PinOff, StickyNote } from "lucide-react";

export function GestionNotesView() {
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminNote | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<AdminNote[]>("/api/admin/notes");
      setNotes(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function togglePin(note: AdminNote) {
    await apiFetch(`/api/admin/notes/${note.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !note.pinned }) });
    load();
  }

  async function handleDelete(note: AdminNote) {
    if (!window.confirm(`Supprimer la note « ${note.title} » ?`)) return;
    await apiFetch(`/api/admin/notes/${note.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <GestionPageHeader
        title="Notes"
        subtitle="Pense-bête interne — procédures, mémos, tout ce qui n'a pas sa place ailleurs"
        action={
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Nouvelle note
          </button>
        }
      />
      <div className="px-4 md:px-10 pb-10">
        {!loading && notes.length === 0 && (
          <div className="bg-navy-900 rounded-2xl border border-navy-700 p-8 text-center text-sm text-navy-100/50">
            Aucune note pour l&apos;instant.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {notes.map((n) => (
            <div
              key={n.id}
              onClick={() => setEditing(n)}
              className="bg-navy-900 rounded-2xl border border-navy-700 p-4 cursor-pointer hover:border-sunset-500/50 transition-colors flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-cream-50 truncate flex-1">{n.title}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(n);
                    }}
                    title={n.pinned ? "Désépingler" : "Épingler"}
                    className={clsx("hover:text-sunset-500", n.pinned ? "text-sunset-500" : "text-navy-100/30")}
                  >
                    {n.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(n);
                    }}
                    title="Supprimer"
                    className="text-navy-100/30 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-navy-100/50 whitespace-pre-line line-clamp-4 flex-1">
                {n.content || <span className="italic text-navy-100/30">Note vide</span>}
              </p>
              <p className="text-[10px] text-navy-100/35">Modifié le {formatDateTime(n.updatedAt)}</p>
            </div>
          ))}
        </div>
      </div>

      {(editing || creating) && (
        <NoteModal
          existing={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            load();
          }}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function NoteModal({
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  existing: AdminNote | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await apiFetch(`/api/admin/notes/${existing.id}`, { method: "PATCH", body: JSON.stringify({ title, content, pinned }) });
      } else {
        await apiFetch("/api/admin/notes", { method: "POST", body: JSON.stringify({ title, content, pinned }) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    if (!window.confirm(`Supprimer la note « ${existing.title} » ?`)) return;
    await apiFetch(`/api/admin/notes/${existing.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700 sticky top-0 bg-navy-900">
          <h2 className="font-semibold text-cream-50 flex items-center gap-2">
            <StickyNote size={16} className="text-sunset-500" /> {existing ? "Modifier la note" : "Nouvelle note"}
          </h2>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre"
            className="input-dark font-semibold"
            required
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Écris ta note ici..."
            className="input-dark min-h-48"
          />
          <label className="flex items-center gap-2 text-sm text-navy-100/70">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4 accent-sunset-500" />
            Épingler en tête de liste
          </label>
          {error && <p className="text-red-400 text-sm bg-red-500/15 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            {existing && (
              <button
                type="button"
                onClick={handleDelete}
                title="Supprimer"
                className="rounded-lg border border-navy-700 text-navy-100/60 hover:text-red-400 hover:border-red-500/40 px-3 py-2"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
