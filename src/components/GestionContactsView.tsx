"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AdminContact } from "@/types/models";
import { GestionPageHeader } from "@/components/GestionShell";
import { Plus, X, Trash2, Phone, Mail, Pencil, Contact2 } from "lucide-react";

const CATEGORY_SUGGESTIONS = ["Comptable", "Banque", "Assurance", "Fournisseur", "DGAC", "Maintenance", "Autre"];

export function GestionContactsView() {
  const [contacts, setContacts] = useState<AdminContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminContact | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<AdminContact[]>("/api/admin/contacts");
      setContacts(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(contact: AdminContact) {
    if (!window.confirm(`Supprimer le contact « ${contact.name} » ?`)) return;
    await apiFetch(`/api/admin/contacts/${contact.id}`, { method: "DELETE" });
    load();
  }

  const grouped = useMemo(() => {
    const map = new Map<string, AdminContact[]>();
    for (const c of contacts) {
      const key = c.category ?? "Autres";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [contacts]);

  return (
    <div>
      <GestionPageHeader
        title="Contacts"
        subtitle="Annuaire — comptable, banque, assurance, fournisseurs..."
        action={
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Ajouter un contact
          </button>
        }
      />
      <div className="px-4 md:px-10 pb-10">
        {!loading && contacts.length === 0 && (
          <div className="bg-navy-900 rounded-2xl border border-navy-700 p-8 text-center text-sm text-navy-100/50">
            Aucun contact pour l&apos;instant. Ajoute ton comptable, ta banque, ton assureur...
          </div>
        )}

        {grouped.map(([category, list]) => (
          <div key={category} className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden mb-5">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-navy-700">
              <Contact2 size={15} className="text-sunset-500" />
              <h2 className="font-semibold text-cream-50">{category}</h2>
            </div>
            <div className="divide-y divide-navy-800">
              {list.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-cream-50 truncate">{c.name}</p>
                    <p className="text-xs text-navy-100/50 flex flex-wrap items-center gap-x-3">
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-sunset-500">
                          <Phone size={11} /> {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-sunset-500">
                          <Mail size={11} /> {c.email}
                        </a>
                      )}
                    </p>
                    {c.notes && <p className="text-xs text-navy-100/40 mt-0.5">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => setEditing(c)} title="Modifier" className="text-navy-100/40 hover:text-cream-50">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(c)} title="Supprimer" className="text-navy-100/40 hover:text-red-400">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <ContactModal
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
        />
      )}
    </div>
  );
}

function ContactModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: AdminContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { name, category: category || null, phone: phone || null, email: email || null, notes: notes || null };
      if (existing) {
        await apiFetch(`/api/admin/contacts/${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/admin/contacts", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
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
          <h2 className="font-semibold text-cream-50">{existing ? "Modifier le contact" : "Ajouter un contact"}</h2>
          <button onClick={onClose} className="text-navy-100/50 hover:text-cream-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-dark" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Catégorie (optionnel)</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-dark"
              list="admin-contact-categories"
              placeholder="Comptable, Banque..."
            />
            <datalist id="admin-contact-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-100/60">Téléphone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-dark" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-100/60">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-100/60">Notes (optionnel)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-dark min-h-16" />
          </label>
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
