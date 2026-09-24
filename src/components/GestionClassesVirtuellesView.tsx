"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { TheoryClass } from "@/types/models";
import { formatDateTime } from "@/lib/format";
import { GestionPageHeader } from "@/components/GestionShell";
import { GraduationCap, Plus, X, Video, FileText } from "lucide-react";

export function GestionClassesVirtuellesView() {
  const [classes, setClasses] = useState<TheoryClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<TheoryClass[]>("/api/theory-classes");
      setClasses(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <GestionPageHeader
        title="Classes virtuelles"
        subtitle="Cours théoriques à distance — visio et documents de cours, FI et élèves"
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Nouvelle classe
          </button>
        }
      />
      <div className="px-4 md:px-10 pb-10">
        {!loading && classes.length === 0 && (
          <div className="bg-navy-900 rounded-2xl border border-navy-700 p-8 text-center text-sm text-navy-100/50">
            Aucune classe pour l&apos;instant. Crée une classe (ex: « Théorique — Aérodynamique ») pour obtenir sa
            salle de visio et y déposer les supports de cours.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => (
            <Link
              key={c.id}
              href={`/gestion/classes-virtuelles/${c.id}`}
              className="flex flex-col gap-2 bg-navy-900 border border-navy-700 hover:border-sunset-500/50 rounded-2xl p-4 transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 rounded-lg bg-navy-800 p-2 text-sunset-500">
                  <GraduationCap size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-cream-50 truncate">{c.title}</p>
                  {c.description && <p className="text-xs text-navy-100/50 mt-0.5 line-clamp-2">{c.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-navy-100/40 mt-1">
                <span className="flex items-center gap-1">
                  <Video size={12} /> Salle prête
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={12} /> {c.documents?.length ?? 0} document{(c.documents?.length ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-[11px] text-navy-100/35 mt-auto pt-1">Créée le {formatDateTime(c.createdAt)}</p>
            </Link>
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/theory-classes", {
        method: "POST",
        body: JSON.stringify({ title, description: description || null }),
      });
      onCreated();
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
          <h2 className="font-semibold text-cream-50">Nouvelle classe virtuelle</h2>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <input
            required
            autoFocus
            placeholder="Titre (ex: Théorique — Aérodynamique)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-dark"
          />
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
            {saving ? "Création..." : "Créer la classe"}
          </button>
        </form>
      </div>
    </div>
  );
}
