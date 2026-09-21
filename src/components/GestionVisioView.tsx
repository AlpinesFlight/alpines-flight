"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { GestionPageHeader } from "@/components/GestionShell";
import { Video, Copy, Check, ExternalLink, Pencil, Info } from "lucide-react";

const NEW_MEETING_URL = "https://meet.google.com/new";

export function GestionVisioView() {
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<{ googleMeetLink: string | null }>("/api/admin/settings")
      .then((s) => setMeetLink(s.googleMeetLink))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const trimmed = draft.trim();
      const s = await apiFetch<{ googleMeetLink: string | null }>("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ googleMeetLink: trimmed || null }),
      });
      setMeetLink(s.googleMeetLink);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!meetLink) return;
    try {
      await navigator.clipboard.writeText(meetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Best-effort : si le presse-papiers est refusé, le lien reste
      // consultable/copiable manuellement dans le champ affiché.
    }
  }

  return (
    <div>
      <GestionPageHeader title="Visio" subtitle="Réunions Google Meet" />
      <div className="px-4 md:px-10 pb-10 flex flex-col gap-5">
        <div className="bg-navy-900 rounded-2xl border border-navy-700 p-5 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold text-cream-50">Nouvelle réunion</h2>
            <p className="text-sm text-navy-100/50 mt-0.5">
              Crée une réunion Google Meet instantanée et partage le lien aux participants.
            </p>
          </div>
          <a
            href={NEW_MEETING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Video size={16} /> Démarrer sur Google Meet
          </a>
        </div>

        <div className="bg-navy-900 rounded-2xl border border-navy-700 p-5 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold text-cream-50">Salle habituelle</h2>
            <p className="text-sm text-navy-100/50 mt-0.5">
              Un lien Meet fixe (ex. ta salle personnelle Google Calendar), pour un appel récurrent sans avoir à le
              repartager à chaque fois.
            </p>
          </div>

          {!loading && !editing && (
            meetLink ? (
              <>
                <p className="text-xs text-navy-100/70 bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 truncate font-mono">
                  {meetLink}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-navy-100 text-sm font-semibold px-3.5 py-2 transition-colors"
                  >
                    <ExternalLink size={15} /> Ouvrir
                  </a>
                  <button
                    onClick={copyLink}
                    className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-navy-100 text-sm font-semibold px-3.5 py-2 transition-colors"
                  >
                    {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                    {copied ? "Copié" : "Copier le lien"}
                  </button>
                  <button
                    onClick={() => {
                      setDraft(meetLink);
                      setEditing(true);
                    }}
                    className="flex items-center gap-1.5 rounded-lg text-navy-100/50 hover:text-cream-50 text-sm px-2 py-2 transition-colors"
                  >
                    <Pencil size={14} /> Modifier
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => {
                  setDraft("");
                  setEditing(true);
                }}
                className="self-start text-sm text-sunset-500 hover:underline"
              >
                + Enregistrer un lien fixe
              </button>
            )
          )}

          {editing && (
            <div className="flex flex-col gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                className="input-dark"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors disabled:opacity-60"
                >
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg text-navy-100/50 hover:text-cream-50 text-sm px-3.5 py-2 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-xs text-navy-100/40 max-w-xl">
          <Info size={13} className="shrink-0 mt-0.5" />
          Google bloque l&apos;intégration de Meet dans une page tierce (contrairement à Jitsi utilisé avant) — les
          liens s&apos;ouvrent toujours dans un nouvel onglet.
        </p>
      </div>
    </div>
  );
}
