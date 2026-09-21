"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { AdminEvent } from "@/types/models";
import { formatDate } from "@/lib/format";
import { Plus, X, Trash2, MapPin, ShieldAlert, Clock } from "lucide-react";

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Aujourd'hui";
  if (dayKey(iso) === dayKey(tomorrow.toISOString())) return "Demain";
  return formatDate(d);
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
}

export function GestionPlanningView() {
  const { data: session, status: sessionStatus } = useSession();
  const isGerant = session?.user?.role === "GERANT";
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<AdminEvent[]>("/api/admin/events");
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "loading" || !isGerant) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, isGerant]);

  async function handleDelete(event: AdminEvent) {
    if (!window.confirm(`Supprimer « ${event.title} » de l'agenda ?`)) return;
    await apiFetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
    load();
  }

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const grouped = useMemo(() => {
    const visible = events.filter((e) => showPast || new Date(e.startTime).getTime() >= startOfToday);
    const map = new Map<string, AdminEvent[]>();
    for (const e of visible) {
      const key = dayKey(e.startTime);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => a[0].startTime.localeCompare(b[0].startTime));
  }, [events, showPast, startOfToday]);

  const pastCount = events.length - events.filter((e) => new Date(e.startTime).getTime() >= startOfToday).length;

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

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center flex-wrap gap-3 mb-5">
        {pastCount > 0 && (
          <button
            onClick={() => setShowPast((s) => !s)}
            className="text-xs font-semibold text-navy-600 hover:text-navy-900 bg-navy-50 hover:bg-navy-100 px-3 py-1.5 rounded-full transition-colors"
          >
            {showPast ? "Masquer les événements passés" : `Afficher les événements passés (${pastCount})`}
          </button>
        )}
        <button
          onClick={() => setShowAdd(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Ajouter un événement
        </button>
      </div>

      {!loading && grouped.length === 0 && (
        <div className="bg-white rounded-2xl border border-navy-100 p-8 text-center text-sm text-navy-600">
          Aucun événement à venir. Ajoute un rendez-vous, une échéance ou une visite.
        </div>
      )}

      {grouped.map(([key, dayEvents]) => (
        <div key={key} className="bg-white rounded-2xl border border-navy-100 overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-navy-100">
            <h2 className="font-semibold text-navy-900">{dayLabel(dayEvents[0].startTime)}</h2>
          </div>
          <div className="divide-y divide-navy-100">
            {dayEvents.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex items-center gap-1 text-xs font-semibold text-navy-500 shrink-0 mt-0.5 w-12">
                    <Clock size={12} /> {timeLabel(e.startTime)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate">{e.title}</p>
                    <p className="text-xs text-navy-500 flex flex-wrap items-center gap-x-2">
                      {e.category && (
                        <span className="bg-navy-100 text-navy-700 px-1.5 py-0.5 rounded-full font-semibold">{e.category}</span>
                      )}
                      {e.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} /> {e.location}
                        </span>
                      )}
                    </p>
                    {e.notes && <p className="text-xs text-navy-500 mt-0.5">{e.notes}</p>}
                  </div>
                </div>
                <button onClick={() => handleDelete(e)} title="Supprimer" className="text-navy-400 hover:text-red-600 shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showAdd && (
        <AddEventModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const CATEGORY_SUGGESTIONS = ["Banque", "DGAC", "Échéance fiscale", "RDV", "Assurance", "Autre"];

function AddEventModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [startTime, setStartTime] = useState(toLocalInput(new Date()));
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/events", {
        method: "POST",
        body: JSON.stringify({
          title,
          category: category || null,
          startTime: new Date(startTime).toISOString(),
          endTime: endTime ? new Date(endTime).toISOString() : null,
          location: location || null,
          notes: notes || null,
        }),
      });
      onSaved();
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
          <h2 className="font-semibold text-navy-900">Ajouter un événement</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Titre</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Début</span>
              <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Fin (optionnel)</span>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Catégorie (optionnel)</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input"
              list="admin-event-categories"
              placeholder="Banque, DGAC..."
            />
            <datalist id="admin-event-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Lieu (optionnel)</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Notes (optionnel)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-16" />
          </label>
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Ajouter"}
          </button>
        </form>
      </div>
    </div>
  );
}
