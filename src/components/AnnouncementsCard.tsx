"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { upload } from "@vercel/blob/client";
import { apiFetch } from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/blob";
import { Announcement, AnnouncementAcknowledgments, AnnouncementAudience } from "@/types/models";
import { formatDateTime } from "@/lib/format";
import { clsx } from "clsx";
import { Megaphone, Plus, X, Paperclip, Trash2, FileText, CheckCircle2, Printer, Users } from "lucide-react";

export function AnnouncementsCard() {
  const { data: session } = useSession();
  const canManage = session?.user?.role === "GERANT" || session?.user?.role === "ADMIN";
  const isInstructor = session?.user?.role === "INSTRUCTOR";
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rechargement après chaque action : la liste reste affichée pendant ce
  // temps, une réponse périmée est ignorée.
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Announcement[]>("/api/announcements")
      .then((data) => {
        if (!cancelled) setAnnouncements(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleDelete(a: Announcement) {
    const message =
      a.audience === "INSTRUCTORS"
        ? "Supprimer cette actualité ? Sa liste de diffusion et les accusés de lecture des instructeurs seront supprimés avec elle."
        : "Supprimer cette actualité ?";
    if (!window.confirm(message)) return;
    await apiFetch(`/api/announcements/${a.id}`, { method: "DELETE" });
    load();
  }

  async function handleAcknowledge(id: string) {
    setAcknowledging(id);
    setError(null);
    try {
      await apiFetch(`/api/announcements/${id}/acknowledge`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setAcknowledging(null);
    }
  }

  // Actualités « Instructeurs » que ce compte n'a pas encore confirmées.
  const toConfirm = announcements.filter(
    (a) => a.audience === "INSTRUCTORS" && (a.myReceipt || isInstructor) && !a.myReceipt?.acknowledgedAt
  ).length;

  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
        <h2 className="flex items-center gap-2 font-semibold text-navy-900">
          <Megaphone size={16} className="text-sunset-600" /> Actualités
          {toConfirm > 0 && (
            <span className="ml-1 rounded-full bg-sunset-500 px-2 py-0.5 text-[11px] font-semibold text-white">
              {toConfirm} à lire et confirmer
            </span>
          )}
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
        {error && <p className="px-5 py-2 text-sm text-red-600 bg-red-100">{error}</p>}
        {announcements.map((a) => (
          <div key={a.id} className="px-5 py-4 group">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-navy-900">
                {a.title}
                {a.audience === "INSTRUCTORS" && (
                  <span className="ml-2 align-middle inline-flex items-center gap-1 rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <Users size={10} /> Instructeurs
                  </span>
                )}
              </p>
              {canManage && (
                <button
                  onClick={() => handleDelete(a)}
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

            {/* Actualité « Instructeurs » : accusé de lecture du destinataire,
                suivi des lectures pour la gestion. */}
            {a.audience === "INSTRUCTORS" && (a.myReceipt || isInstructor) && (
              <div className="mt-2.5">
                {a.myReceipt?.acknowledgedAt ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                    <CheckCircle2 size={14} /> Lu et pris connaissance le {formatDateTime(a.myReceipt.acknowledgedAt)}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(a.id)}
                    disabled={acknowledging === a.id}
                    className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-60"
                  >
                    <CheckCircle2 size={14} /> {acknowledging === a.id ? "Enregistrement…" : "J'ai lu et pris connaissance"}
                  </button>
                )}
              </div>
            )}
            {a.audience === "INSTRUCTORS" && canManage && a.recipientCount !== undefined && (
              <button
                type="button"
                onClick={() => setTrackingId(a.id)}
                className={clsx(
                  "mt-2 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                  a.readCount === a.recipientCount
                    ? "border-green-200 text-green-700 hover:bg-green-50"
                    : "border-navy-100 text-navy-700 hover:bg-navy-50"
                )}
              >
                <Users size={13} /> Lu par {a.readCount} / {a.recipientCount} instructeur{a.recipientCount && a.recipientCount > 1 ? "s" : ""}
              </button>
            )}
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

      {trackingId && <AcknowledgmentsModal announcementId={trackingId} onClose={() => setTrackingId(null)} />}
    </div>
  );
}

// Suivi de diffusion d'une actualité « Instructeurs » (gestion) : à qui elle
// a été diffusée, qui l'a lue et quand — avec la version imprimable qui sert
// de preuve en cas de contrôle.
function AcknowledgmentsModal({ announcementId, onClose }: { announcementId: string; onClose: () => void }) {
  const [data, setData] = useState<AnnouncementAcknowledgments | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AnnouncementAcknowledgments>(`/api/announcements/${announcementId}/acknowledgments`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur inconnue");
      });
    return () => {
      cancelled = true;
    };
  }, [announcementId]);

  const read = data?.recipients.filter((r) => r.acknowledgedAt) ?? [];
  const unread = data?.recipients.filter((r) => !r.acknowledgedAt) ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">Suivi de lecture</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          {!data && !error && <p className="text-sm text-navy-600">Chargement…</p>}
          {data && (
            <>
              <div>
                <p className="text-sm font-semibold text-navy-900">{data.announcement.title}</p>
                <p className="text-xs text-navy-500 mt-0.5">
                  Diffusée le {formatDateTime(data.announcement.createdAt)} à {data.recipients.length} instructeur
                  {data.recipients.length > 1 ? "s" : ""} · lue par {read.length}
                </p>
              </div>
              <div className="rounded-xl border border-navy-100 divide-y divide-navy-100">
                {data.recipients.length === 0 && (
                  <p className="px-3.5 py-3 text-sm text-navy-600">Aucun instructeur dans la liste de diffusion.</p>
                )}
                {[...unread, ...read].map((r) => (
                  <div key={r.user.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span className="text-navy-900">
                      {r.user.firstName} {r.user.lastName}
                    </span>
                    {r.acknowledgedAt ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-700 shrink-0">
                        <CheckCircle2 size={13} /> Lu le {formatDateTime(r.acknowledgedAt)}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-sunset-600 shrink-0">Pas encore lu</span>
                    )}
                  </div>
                ))}
              </div>
              <a
                href={`/actualites/${announcementId}/preuve`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 text-sm font-semibold px-3.5 py-2 transition-colors"
              >
                <Printer size={15} /> Imprimer la preuve de diffusion
              </a>
            </>
          )}
        </div>
      </div>
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
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Progression globale (moyenne des fichiers en cours) — plusieurs pièces
  // jointes possibles, pas de sens à afficher un pourcentage par fichier ici.
  const [progress, setProgress] = useState<number | null>(null);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const tooBig = Array.from(newFiles).find((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig) {
      setError(`« ${tooBig.name} » dépasse ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} Mo.`);
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...Array.from(newFiles)].slice(0, 5));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProgress(files.length > 0 ? 0 : null);
    setError(null);
    try {
      // Envoi direct du navigateur vers Vercel Blob, un par pièce jointe —
      // contourne la limite dure de 4,5 Mo sur le corps d'une requête
      // serverless (voir /api/announcements/blob-upload).
      const perFileProgress = new Array(files.length).fill(0);
      const attachments = await Promise.all(
        files.map(async (file, i) => {
          const blob = await upload(`announcement-attachments/${Date.now()}-${file.name}`, file, {
            access: "private",
            handleUploadUrl: "/api/announcements/blob-upload",
            multipart: true,
            onUploadProgress: ({ percentage }) => {
              perFileProgress[i] = percentage;
              setProgress(perFileProgress.reduce((s, p) => s + p, 0) / files.length);
            },
          });
          return { fileName: file.name, blobUrl: blob.url };
        })
      );

      await apiFetch("/api/announcements", {
        method: "POST",
        body: JSON.stringify({ title, body, audience, attachments }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">Publier une actualité</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-navy-600">Destinataires</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-navy-50 p-1" role="radiogroup" aria-label="Destinataires">
              {(
                [
                  { value: "ALL", label: "Tout le monde" },
                  { value: "INSTRUCTORS", label: "Instructeurs uniquement" },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={audience === o.value}
                  onClick={() => setAudience(o.value)}
                  className={clsx(
                    "h-8 rounded-lg text-sm font-medium transition-colors",
                    audience === o.value ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-800"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-navy-600">
              {audience === "ALL"
                ? "Visible immédiatement par tous les comptes sur le tableau de bord."
                : "Visible seulement des instructeurs. Chacun devra confirmer l'avoir lue : tu verras à qui elle a été diffusée, qui l'a lue et quand, avec une preuve imprimable."}
            </p>
          </div>
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
              Documents joints (optionnel, 5 max, PDF/image/Word/Excel)
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

          {progress !== null && <p className="text-xs text-navy-500">Envoi... {Math.round(progress)} %</p>}
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
