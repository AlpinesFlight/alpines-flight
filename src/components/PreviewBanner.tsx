"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Search, X } from "lucide-react";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import { UserLite } from "@/types/models";

// Rechargement complet sur l'accueil, pas router.push : les pages serveur ET
// la session déjà chargée dans le navigateur doivent repartir du nouveau jeton.
function reloadOnHome() {
  window.location.assign(window.location.origin);
}

// Sortie de l'aperçu "Voir en tant que" : rend le jeton au Gérant puis
// recharge tout sur son compte.
export async function leavePreview() {
  await fetch("/api/preview", { method: "DELETE" }).catch(() => null);
  reloadOnHome();
}

// Bandeau toujours présent pendant un aperçu — voir src/lib/auth.ts.
// Collant en haut sur ordinateur ; sur mobile il défile avec la page et la
// barre du haut (Sidebar.tsx) garde son propre bouton de sortie.
export function PreviewBanner({ viewedName, viewedRole }: { viewedName: string; viewedRole: string }) {
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="md:sticky md:top-0 z-40 bg-sunset-500 text-white px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm">
      <span className="flex items-center gap-2 text-center">
        <Eye size={16} className="shrink-0" />
        <span>
          Aperçu en lecture seule : tu vois l&apos;appli comme <strong>{viewedName}</strong> ({viewedRole}).
        </span>
      </span>
      <button
        type="button"
        disabled={leaving}
        onClick={() => {
          setLeaving(true);
          leavePreview();
        }}
        className="rounded-lg bg-white text-sunset-600 hover:bg-cream-50 font-semibold px-3 py-1 text-xs disabled:opacity-60"
      >
        {leaving ? "Retour…" : "Revenir à mon compte"}
      </button>
    </div>
  );
}

type Group = { key: string; title: string; people: UserLite[] };

function groupOf(user: UserLite): string {
  if (user.role === "ADMIN") return "ADMIN";
  if (user.role === "INSTRUCTOR") return "INSTRUCTOR";
  return "STUDENT";
}

// Choix du compte à afficher (Gérant) : tous les comptes sauf les Gérants,
// rangés comme l'appli les distingue — pilotes/élèves, instructeurs,
// administrateurs.
export function PreviewPickerModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<UserLite[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<UserLite[]>("/api/users")
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur inconnue"));
  }, []);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const candidates = (users ?? [])
      .filter((u) => u.role !== "GERANT")
      .filter((u) => !q || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    return [
      { key: "STUDENT", title: "Pilotes & élèves" },
      { key: "INSTRUCTOR", title: "Instructeurs" },
      { key: "ADMIN", title: "Administrateurs" },
    ]
      .map((g) => ({ ...g, people: candidates.filter((u) => groupOf(u) === g.key) }))
      .filter((g) => g.people.length > 0);
  }, [users, query]);

  async function start(user: UserLite) {
    setStartingId(user.id);
    setError(null);
    try {
      await apiFetch("/api/preview", { method: "POST", body: JSON.stringify({ userId: user.id }) });
      reloadOnHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setStartingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white text-navy-900 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold">Voir l&apos;appli en tant que…</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pt-4 pb-3 flex flex-col gap-3 border-b border-navy-100">
          <p className="text-xs text-navy-600">
            Tu verras exactement les menus et les pages de ce compte, avec ses données. Lecture seule : rien ne peut
            être enregistré ni envoyé pendant l&apos;aperçu.
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un compte…"
              className="input pl-8 py-1.5"
            />
          </div>
        </div>
        <div className="overflow-y-auto px-2 py-2">
          {error && <p className="mx-3 my-2 text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          {!users && !error && <p className="px-3 py-4 text-sm text-navy-600">Chargement…</p>}
          {users && groups.length === 0 && <p className="px-3 py-4 text-sm text-navy-600">Aucun compte trouvé.</p>}
          {groups.map((g) => (
            <section key={g.key} className="mb-2">
              <h3 className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
                {g.title}
              </h3>
              {g.people.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={startingId !== null}
                  onClick={() => start(u)}
                  className={clsx(
                    "w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
                    startingId === u.id ? "bg-sunset-100" : "hover:bg-navy-50"
                  )}
                >
                  <span className="truncate">
                    {u.firstName} {u.lastName}
                  </span>
                  <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-sunset-600">
                    <Eye size={13} /> {startingId === u.id ? "Ouverture…" : "Voir"}
                  </span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
