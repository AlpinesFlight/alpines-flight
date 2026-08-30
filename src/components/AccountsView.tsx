"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { Role } from "@/types/models";
import { formatDate } from "@/lib/format";
import { KeyRound, ShieldAlert, GraduationCap, UserCog, UserX } from "lucide-react";
import { clsx } from "clsx";

interface AccountUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  createdAt: string;
  studentProfile: { id: string } | null;
  instructorProfile: { id: string } | null;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "GERANT", label: "Gérant" },
  { value: "ADMIN", label: "Admin" },
  { value: "INSTRUCTOR", label: "FI" },
  { value: "STUDENT", label: "Élève / pilote" },
];

const ROLE_STYLE: Record<Role, string> = {
  GERANT: "bg-sunset-500 text-white",
  ADMIN: "bg-navy-800 text-white",
  INSTRUCTOR: "bg-navy-100 text-navy-700",
  STUDENT: "bg-green-100 text-green-700",
};

const ROLE_BLURB: { role: Role; label: string; desc: string }[] = [
  { role: "GERANT", label: "Gérant", desc: "Tous les droits, y compris les finances (comptes pilotes, IBAN, export)." },
  { role: "ADMIN", label: "Admin", desc: "Gère l'école au quotidien (élèves, instructeurs, flotte, formation, licences, actualités) — jamais les finances." },
  { role: "INSTRUCTOR", label: "FI", desc: "Réserve/annule des vols et remplit les fiches de progression." },
  { role: "STUDENT", label: "Élève / pilote", desc: "Réserve/annule ses vols, déclare ses versements, gère ses licences." },
];

export function AccountsView() {
  const { data: session, status: sessionStatus } = useSession();
  const isGerant = session?.user?.role === "GERANT";
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<AccountUser[]>("/api/users");
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Attend la session résolue avant de statuer sur l'accès, pour ne pas
    // flasher "Accès réservé" au Gérant lui-même le temps que la session
    // s'hydrate côté client.
    if (sessionStatus === "loading") return;
    if (isGerant) load();
    else setLoading(false);
  }, [sessionStatus, isGerant]);

  const grouped = useMemo(() => {
    const map = new Map<Role, AccountUser[]>();
    for (const u of users) {
      const arr = map.get(u.role) ?? [];
      arr.push(u);
      map.set(u.role, arr);
    }
    return map;
  }, [users]);

  async function changeRole(userId: string, role: Role) {
    setSavingId(userId);
    setError(null);
    try {
      await apiFetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSavingId(null);
    }
  }

  // Droit à l'effacement (RGPD art. 17) — voir le commentaire de
  // /api/users/[id]/anonymize/route.ts pour ce qui est conservé/effacé.
  async function anonymize(userId: string, fullName: string) {
    if (
      !window.confirm(
        `Anonymiser le compte de ${fullName} ?\n\n` +
          "Nom, email et téléphone seront remplacés par des valeurs anonymes, la connexion sera définitivement " +
          "impossible, et ses documents de licence/médicale seront supprimés. Le solde et l'historique de vols " +
          "restent conservés (obligations comptables et DTO), rattachés au compte désormais anonyme.\n\n" +
          "Cette action est irréversible."
      )
    )
      return;
    setSavingId(userId);
    setError(null);
    try {
      await apiFetch(`/api/users/${userId}/anonymize`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSavingId(null);
    }
  }

  if (!isGerant) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 flex flex-col items-center text-center gap-2 max-w-md mx-auto mt-8">
          <ShieldAlert size={28} className="text-navy-400" />
          <p className="font-semibold text-navy-900">Accès réservé au Gérant</p>
          <p className="text-sm text-navy-600">
            Seul le compte Gérant peut consulter et modifier les droits d&apos;accès des autres comptes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="bg-white rounded-2xl border border-navy-100 p-5 mb-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy-900 mb-3">
          <KeyRound size={16} className="text-sunset-600" /> Les 4 niveaux d&apos;accès
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {ROLE_BLURB.map((r) => (
            <div key={r.role} className="flex items-start gap-2 text-xs">
              <span className={clsx("shrink-0 mt-0.5 font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", ROLE_STYLE[r.role])}>
                {r.label}
              </span>
              <span className="text-navy-600">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>}

      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-navy-600 border-b border-navy-100">
              <th className="px-5 py-3 font-medium">Nom</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Profils</th>
              <th className="px-5 py-3 font-medium">Compte créé le</th>
              <th className="px-5 py-3 font-medium">Rôle</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {ROLE_OPTIONS.flatMap((roleGroup) => {
              const groupUsers = grouped.get(roleGroup.value) ?? [];
              if (groupUsers.length === 0) return [];
              return [
                <tr key={`h-${roleGroup.value}`} className="bg-navy-50/60">
                  <td colSpan={5} className="px-5 py-1.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wide">
                    {roleGroup.label} · {groupUsers.length}
                  </td>
                </tr>,
                ...groupUsers.map((u) => {
                  const isSelf = u.id === session?.user?.id;
                  return (
                    <tr key={u.id} className="hover:bg-navy-50/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-navy-900">
                        {u.firstName} {u.lastName}
                        {isSelf && <span className="ml-1.5 text-[11px] text-navy-400 font-normal">(toi)</span>}
                      </td>
                      <td className="px-5 py-3 text-navy-600">{u.email}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 text-navy-400">
                          {u.instructorProfile && (
                            <span title="A un profil instructeur"><UserCog size={14} /></span>
                          )}
                          {u.studentProfile && (
                            <span title="A un profil élève/pilote (compte pilote)"><GraduationCap size={14} /></span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-navy-500 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                      <td className="px-5 py-3">
                        {isSelf ? (
                          <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap", ROLE_STYLE[u.role])}>
                            {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={savingId === u.id}
                            onChange={(e) => changeRole(u.id, e.target.value as Role)}
                            className={clsx(
                              "text-xs font-semibold rounded-full px-2.5 py-1 border-none disabled:opacity-50",
                              ROLE_STYLE[u.role]
                            )}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {!isSelf && (
                          <button
                            onClick={() => anonymize(u.id, `${u.firstName} ${u.lastName}`)}
                            disabled={savingId === u.id}
                            title="Anonymiser (droit à l'effacement RGPD)"
                            className="text-navy-400 hover:text-red-600 disabled:opacity-50"
                          >
                            <UserX size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-navy-600">
                  Aucun compte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
