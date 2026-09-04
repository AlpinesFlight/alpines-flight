"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { UserLite, Aircraft } from "@/types/models";
import { formatHours, formatMoney } from "@/lib/format";
import { Plus, Search, X, ShieldCheck, Pencil, UserX, Trash2 } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import { isInstructorOrAbove } from "@/lib/permissions";

const TYPE_FILTERS = [
  { key: "ALL", label: "Tous" },
  { key: "STUDENT", label: "Élèves" },
  { key: "PILOT", label: "Pilotes" },
] as const;

export function StudentsView() {
  const searchParams = useSearchParams();
  // Arrivée depuis "+" sur la page Instructeurs (voir InstructorsView.tsx,
  // qui renvoie ici faute de formulaire dédié) : ouvre directement le
  // formulaire de création avec l'onglet FI déjà sélectionné, plutôt que de
  // laisser retomber sur Élève et forcer un clic de plus.
  const startAsInstructor = searchParams.get("newRole") === "INSTRUCTOR";
  const [students, setStudents] = useState<UserLite[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["key"]>("ALL");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(startAsInstructor);
  const [detail, setDetail] = useState<UserLite | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<UserLite[]>("/api/students");
      setStudents(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = students
    .filter((s) =>
      typeFilter === "ALL"
        ? true
        : typeFilter === "PILOT"
        ? s.studentProfile?.isPilot
        : !s.studentProfile?.isPilot
    )
    .filter((s) => `${s.firstName} ${s.lastName} ${s.email}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-600"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un élève ou pilote..."
            className="input pl-9"
          />
        </div>
        <div className="flex items-center bg-navy-50 rounded-lg p-1 gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                typeFilter === f.key ? "bg-white text-navy-900 shadow-sm" : "text-navy-600 hover:text-navy-900"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Ajouter un nouveau membre
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-navy-600 border-b border-navy-100">
              <th className="px-5 py-3 font-medium">Nom</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Licence</th>
              <th className="px-5 py-3 font-medium">Heures</th>
              <th className="px-5 py-3 font-medium">Solde</th>
              <th className="px-5 py-3 font-medium">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {filtered.map((s) => (
              <tr
                key={s.id}
                onClick={() => setDetail(s)}
                className="cursor-pointer hover:bg-navy-50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-navy-900">
                  {s.firstName} {s.lastName}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={clsx(
                      "text-[11px] font-semibold px-2 py-1 rounded-full",
                      s.studentProfile?.isPilot ? "bg-navy-800 text-white" : "bg-sunset-100 text-sunset-600"
                    )}
                  >
                    {s.studentProfile?.isPilot ? "Pilote" : "Élève"}
                  </span>
                </td>
                <td className="px-5 py-3 text-navy-700">
                  {s.studentProfile?.licenseType ?? "—"}
                </td>
                <td className="px-5 py-3 text-navy-700">
                  {formatHours(s.studentProfile?.totalHours ?? 0)}
                </td>
                <td
                  className={`px-5 py-3 font-medium ${
                    (s.studentProfile?.balanceCents ?? 0) < 0
                      ? "text-red-600"
                      : "text-navy-900"
                  }`}
                >
                  {formatMoney(s.studentProfile?.balanceCents ?? 0)}
                </td>
                <td className="px-5 py-3 text-navy-600">{s.email}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-navy-600">
                  Aucun élève ou pilote trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showCreate && (
        <CreateMemberModal
          initialRole={startAsInstructor ? "INSTRUCTOR" : "STUDENT"}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {detail && (
        <StudentDetailModal studentId={detail.id} onClose={() => setDetail(null)} onUpdated={load} />
      )}
    </div>
  );
}

type NewMemberRole = "STUDENT" | "PILOT" | "INSTRUCTOR";

const NEW_MEMBER_ROLES: { key: NewMemberRole; label: string }[] = [
  { key: "STUDENT", label: "Élève" },
  { key: "PILOT", label: "Pilote" },
  { key: "INSTRUCTOR", label: "FI" },
];

// Point d'entrée unique pour ajouter n'importe qui — élève, pilote ou FI —
// avec le choix du type à ce moment-là, plutôt que deux formulaires
// séparés sur deux pages (l'ancien "Nouvel instructeur" de la page
// Instructeurs a été retiré en conséquence, voir InstructorsView.tsx).
// Élève/Pilote posent le même compte STUDENT (isPilot true/false, voir
// StudentProfile) ; FI crée un compte INSTRUCTOR à part — deux routes
// différentes derrière un seul formulaire.
function CreateMemberModal({
  initialRole = "STUDENT",
  onClose,
  onCreated,
}: {
  initialRole?: NewMemberRole;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [role, setRole] = useState<NewMemberRole>(initialRole);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [color, setColor] = useState("#0C2448");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const isInstructor = role === "INSTRUCTOR";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ tempPassword: string | null }>(
        isInstructor ? "/api/instructors" : "/api/students",
        {
          method: "POST",
          body: JSON.stringify(
            isInstructor
              ? {
                  firstName,
                  lastName,
                  email,
                  phone,
                  qualifications,
                  hourlyRateCents: hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null,
                  color,
                  password: password || undefined,
                }
              : {
                  firstName,
                  lastName,
                  email,
                  phone,
                  licenseType,
                  isPilot: role === "PILOT",
                  password: password || undefined,
                }
          ),
        }
      );
      setTempPassword(res.tempPassword);
      setCreated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Ajouter un nouveau membre</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {created ? (
          <div className="p-5 flex flex-col gap-3">
            {tempPassword ? (
              <>
                <p className="text-sm text-navy-700">
                  Compte créé. Mot de passe temporaire à communiquer :
                </p>
                <p className="font-mono text-sm bg-navy-50 rounded-lg px-3 py-2">
                  {tempPassword}
                </p>
              </>
            ) : (
              <p className="text-sm text-navy-700">
                Compte créé avec le mot de passe que tu as choisi.
              </p>
            )}
            <button
              onClick={onCreated}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
            <div className="flex items-center bg-navy-50 rounded-lg p-1 gap-1">
              {NEW_MEMBER_ROLES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRole(r.key)}
                  className={clsx(
                    "flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                    role === r.key ? "bg-white text-navy-900 shadow-sm" : "text-navy-600 hover:text-navy-900"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                required
                placeholder="Prénom"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input"
              />
              <input
                required
                placeholder="Nom"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input"
              />
            </div>
            <input
              required
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
            <input
              placeholder="Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
            />
            {isInstructor ? (
              <input
                placeholder="Qualifications (ex: FI(A), IRI)"
                value={qualifications}
                onChange={(e) => setQualifications(e.target.value)}
                className="input"
              />
            ) : (
              <input
                placeholder="Licence (ex: PPL, LAPL)"
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value)}
                className="input"
              />
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">
                Mot de passe (laisser vide pour en générer un automatiquement)
              </span>
              <input
                type="text"
                placeholder="Min. 8 caractères"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </label>
            {isInstructor && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Tarif instruction €/h (optionnel)"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="input"
                />
                <label className="flex items-center gap-2 text-sm text-navy-700">
                  Couleur
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-9 h-9 rounded border border-navy-100"
                  />
                </label>
              </div>
            )}
            {error && (
              <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Création..." : "Créer le compte"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

interface StudentDetail extends UserLite {
  reservationsAsStudent: Array<{
    id: string;
    startTime: string;
    type: string;
    aircraft: { registration: string };
    instructor: { firstName: string; lastName: string } | null;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    status: string;
    amountCents: number;
    createdAt: string;
    notes: string | null;
  }>;
  // Gérant uniquement — voir PilotAircraftRate et /api/students/[id].
  pilotAircraftRates?: Array<{
    id: string;
    aircraftId: string;
    customRateCents: number;
    aircraft: { id: string; registration: string; type: string; hourlyRateCents: number };
  }>;
}

const TX_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Versement",
  FLIGHT_DEBIT: "Vol",
  ADJUSTMENT: "Ajustement",
};

function StudentDetailModal({
  studentId,
  onClose,
  onUpdated,
}: {
  studentId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { data: session } = useSession();
  const isGerant = session?.user?.role === "GERANT";
  // Lâchers solo : jugement pédagogique du FI, pas une question financière
  // — voir isInstructorOrAbove.
  const isStaff = isInstructorOrAbove(session?.user?.role);
  const [data, setData] = useState<StudentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [togglingPilot, setTogglingPilot] = useState(false);
  const [togglingBaptism, setTogglingBaptism] = useState(false);
  const [togglingSolo, setTogglingSolo] = useState<"GRASS" | "PAVED" | null>(null);
  // Ni handleTogglePilot ni handleToggleBaptism n'affichaient l'erreur en
  // cas d'échec (401 inattendu, coupure réseau...) — le bouton semblait
  // juste ne rien faire, sans aucun indice pour comprendre pourquoi.
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const fresh = await apiFetch<StudentDetail>(`/api/students/${studentId}`);
      setData(fresh);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function handleTogglePilot() {
    if (!data) return;
    setTogglingPilot(true);
    setToggleError(null);
    try {
      await apiFetch(`/api/students/${studentId}`, {
        method: "PATCH",
        body: JSON.stringify({ isPilot: !data.studentProfile?.isPilot }),
      });
      await load();
      onUpdated();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setTogglingPilot(false);
    }
  }

  // Autorisation "vol baptême" — voir StudentProfile.canGiveBaptism : le
  // serveur revérifie de toute façon que c'est bien le Gérant qui appelle
  // (voir /api/students/[id]), le bouton n'est de toute façon affiché que
  // dans ce cas (voir plus bas).
  async function handleToggleBaptism() {
    if (!data) return;
    setTogglingBaptism(true);
    setToggleError(null);
    try {
      await apiFetch(`/api/students/${studentId}`, {
        method: "PATCH",
        body: JSON.stringify({ canGiveBaptism: !data.studentProfile?.canGiveBaptism }),
      });
      await load();
      onUpdated();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setTogglingBaptism(false);
    }
  }

  // Lâchers solo (piste en herbe / piste en dur) — deux autorisations
  // indépendantes, voir StudentProfile.soloGrassCleared/soloPavedCleared et
  // /api/students/[id]/solo-clearance (FI et au-dessus, pas Gérant-only —
  // à la différence du baptême, ce n'est pas une question financière).
  async function handleToggleSolo(field: "GRASS" | "PAVED") {
    if (!data) return;
    setTogglingSolo(field);
    setToggleError(null);
    const key = field === "GRASS" ? "soloGrassCleared" : "soloPavedCleared";
    try {
      await apiFetch(`/api/students/${studentId}/solo-clearance`, {
        method: "PATCH",
        body: JSON.stringify({ [key]: !data.studentProfile?.[key] }),
      });
      await load();
      onUpdated();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setTogglingSolo(null);
    }
  }

  // Droit à l'effacement RGPD — anonymise plutôt que supprimer purement
  // (le solde et l'historique de vols doivent être conservés, obligations
  // comptables et DTO) — même mécanisme que la page Comptes & droits, voir
  // /api/users/[id]/anonymize.
  async function handleAnonymize() {
    if (!data) return;
    if (
      !window.confirm(
        `Anonymiser le compte de ${data.firstName} ${data.lastName} ?\n\n` +
          "Nom, email et téléphone seront remplacés par des valeurs anonymes, la connexion sera définitivement " +
          "impossible, et ses documents de licence/médicale seront supprimés. Le solde et l'historique de vols " +
          "restent conservés (obligations comptables et DTO), rattachés au compte désormais anonyme.\n\n" +
          "Cette action est irréversible."
      )
    )
      return;
    setAnonymizing(true);
    try {
      await apiFetch(`/api/users/${studentId}/anonymize`, { method: "POST" });
      onUpdated();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setAnonymizing(false);
    }
  }

  // Suppression totale (pas une anonymisation) — n'aboutit que si le compte
  // n'a strictement aucun historique (voir DELETE /api/students/[id], qui
  // refuse sinon avec un message clair). Utile pour un compte créé par
  // erreur, jamais utilisé.
  async function handleDelete() {
    if (!data) return;
    if (
      !window.confirm(
        `Supprimer DÉFINITIVEMENT le compte de ${data.firstName} ${data.lastName} ?\n\n` +
          "Contrairement à l'anonymisation, ceci efface totalement le compte — aucune trace ne sera conservée. " +
          "Ça ne fonctionne que si ce compte n'a jamais eu de vol, réservation ou mouvement financier (sinon la " +
          "suppression sera refusée, utilise l'anonymisation à la place dans ce cas).\n\n" +
          "Cette action est irréversible et ne peut pas être annulée."
      )
    )
      return;
    setDeleting(true);
    try {
      await apiFetch(`/api/students/${studentId}`, { method: "DELETE" });
      onUpdated();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">
            {data ? `${data.firstName} ${data.lastName}` : loadError ? "Accès refusé" : "Chargement..."}
          </h2>
          <div className="flex items-center gap-3">
            {data && (
              <button
                onClick={() => setShowEdit(true)}
                title="Modifier les informations"
                className="text-navy-500 hover:text-navy-900"
              >
                <Pencil size={17} />
              </button>
            )}
            {data && isGerant && (
              <button
                onClick={handleAnonymize}
                disabled={anonymizing}
                title="Anonymiser (droit à l'effacement RGPD)"
                className="text-navy-500 hover:text-red-600 disabled:opacity-50"
              >
                <UserX size={17} />
              </button>
            )}
            {data && isGerant && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                title="Supprimer définitivement (seulement si aucun historique)"
                className="text-navy-500 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={17} />
              </button>
            )}
            <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
              <X size={20} />
            </button>
          </div>
        </div>

        {loadError && !data && (
          <p className="p-5 text-sm text-red-600">{loadError}</p>
        )}

        {data && (
          <div className="p-5 flex flex-col gap-5">
            <div className="flex items-center gap-2 -mt-1">
              <span
                className={clsx(
                  "text-[11px] font-semibold px-2 py-1 rounded-full",
                  data.studentProfile?.isPilot ? "bg-navy-800 text-white" : "bg-sunset-100 text-sunset-600"
                )}
              >
                {data.studentProfile?.isPilot ? "Pilote" : "Élève"}
              </span>
              <button
                onClick={handleTogglePilot}
                disabled={togglingPilot}
                className="text-xs text-navy-500 hover:text-navy-800 hover:underline disabled:opacity-50"
              >
                {data.studentProfile?.isPilot ? "Repasser en élève" : "Marquer comme pilote breveté"}
              </button>
            </div>

            {/* Autorisation vol baptême — n'a de sens que pour un pilote
                déjà breveté, et seul le Gérant peut la donner/retirer (voir
                /api/students/[id]). */}
            {isGerant && data.studentProfile?.isPilot && (
              <div className="flex items-center flex-wrap gap-2 -mt-3">
                <span
                  className={clsx(
                    "text-[11px] font-semibold px-2 py-1 rounded-full",
                    data.studentProfile?.canGiveBaptism
                      ? "bg-green-100 text-green-700"
                      : "bg-navy-100 text-navy-500"
                  )}
                >
                  {data.studentProfile?.canGiveBaptism ? "Autorisé vol baptême" : "Non autorisé vol baptême"}
                </span>
                <button
                  onClick={handleToggleBaptism}
                  disabled={togglingBaptism}
                  className="text-xs text-navy-500 hover:text-navy-800 hover:underline disabled:opacity-50"
                >
                  {data.studentProfile?.canGiveBaptism
                    ? "Retirer l'autorisation"
                    : "Autoriser à voler en vol baptême"}
                </button>
              </div>
            )}

            {/* Lâchers solo — jugement pédagogique du FI, deux
                autorisations indépendantes (herbe / dur). */}
            {isStaff && (
              <div className="flex items-center flex-wrap gap-x-4 gap-y-2 -mt-3">
                {(
                  [
                    { field: "GRASS" as const, key: "soloGrassCleared" as const, label: "Lâché piste en herbe" },
                    { field: "PAVED" as const, key: "soloPavedCleared" as const, label: "Lâché piste en dur" },
                  ]
                ).map(({ field, key, label }) => (
                  <div key={field} className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "text-[11px] font-semibold px-2 py-1 rounded-full",
                        data.studentProfile?.[key] ? "bg-green-100 text-green-700" : "bg-navy-100 text-navy-500"
                      )}
                    >
                      {label}
                    </span>
                    <button
                      onClick={() => handleToggleSolo(field)}
                      disabled={togglingSolo !== null}
                      className="text-xs text-navy-500 hover:text-navy-800 hover:underline disabled:opacity-50"
                    >
                      {data.studentProfile?.[key] ? "Retirer" : "Lâcher"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {toggleError && (
              <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2 -mt-2">{toggleError}</p>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Heures totales" value={formatHours(data.studentProfile?.totalHours ?? 0)} />
              <Stat
                label="Solde"
                value={formatMoney(data.studentProfile?.balanceCents ?? 0)}
                danger={(data.studentProfile?.balanceCents ?? 0) < 0}
              />
              <Stat label="Licence" value={data.studentProfile?.licenseType ?? "—"} />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-navy-900 mb-2">Réservations récentes</h3>
              <div className="flex flex-col gap-1.5">
                {data.reservationsAsStudent.length === 0 && (
                  <p className="text-sm text-navy-600">Aucune réservation.</p>
                )}
                {data.reservationsAsStudent.map((r) => (
                  <div key={r.id} className="text-sm flex justify-between text-navy-700">
                    <span>
                      {r.aircraft.registration} · {r.type}
                      {r.instructor ? ` · ${r.instructor.firstName} ${r.instructor.lastName}` : ""}
                    </span>
                    <span className="text-navy-600">
                      {new Date(r.startTime).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href={`/licences?person=${data.id}`}
              className="flex items-center gap-1.5 text-sm text-sunset-600 hover:underline w-fit"
            >
              <ShieldCheck size={15} /> Voir ses licences &amp; qualifications
            </Link>

            <div>
              <h3 className="text-sm font-semibold text-navy-900 mb-2">Compte pilote</h3>
              <div className="flex flex-col gap-1.5">
                {data.transactions.length === 0 && (
                  <p className="text-sm text-navy-600">Aucun mouvement.</p>
                )}
                {data.transactions.map((t) => (
                  <div key={t.id} className="text-sm flex justify-between text-navy-700">
                    <span>
                      {TX_TYPE_LABEL[t.type]}
                      {t.status === "PENDING" && " · en attente"}
                      {t.status === "REJECTED" && " · rejeté"}
                    </span>
                    <span
                      className={
                        t.status === "PENDING"
                          ? "text-sunset-600"
                          : t.amountCents < 0
                          ? "text-red-600"
                          : "text-green-700"
                      }
                    >
                      {t.amountCents >= 0 ? "+" : ""}
                      {formatMoney(t.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {isGerant && (
              <PilotRatesSection
                studentId={data.id}
                rates={data.pilotAircraftRates ?? []}
                onChanged={load}
              />
            )}
          </div>
        )}
      </div>
    </div>

    {showEdit && data && (
      <EditStudentModal
        student={data}
        onClose={() => setShowEdit(false)}
        onSaved={async () => {
          setShowEdit(false);
          await load();
          onUpdated();
        }}
      />
    )}
    </>
  );
}

// Dérogation de tarif avion par pilote — visible et modifiable du Gérant
// uniquement (voir PilotAircraftRate). Une ligne par avion de la flotte ;
// cocher "Tarif dérogatoire" révèle le champ prix, décocher retire
// immédiatement la dérogation (retombe sur le tarif standard).
function PilotRatesSection({
  studentId,
  rates,
  onChanged,
}: {
  studentId: string;
  rates: NonNullable<StudentDetail["pilotAircraftRates"]>;
  onChanged: () => void;
}) {
  const [aircraftList, setAircraftList] = useState<Aircraft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Aircraft[]>("/api/aircraft")
      .then(setAircraftList)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Erreur inconnue"));
  }, []);

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy-900 mb-1">Tarifs avion personnalisés</h3>
      <p className="text-xs text-navy-500 mb-2">Visible et modifiable du Gérant uniquement.</p>
      {loadError && <p className="text-red-600 text-xs bg-red-100 rounded-lg px-3 py-2 mb-2">{loadError}</p>}
      {!aircraftList && !loadError && <p className="text-xs text-navy-500">Chargement…</p>}
      <div className="flex flex-col gap-2">
        {aircraftList?.map((ac) => (
          <PilotRateRow
            key={ac.id}
            studentId={studentId}
            aircraft={ac}
            existing={rates.find((r) => r.aircraftId === ac.id) ?? null}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}

function PilotRateRow({
  studentId,
  aircraft,
  existing,
  onChanged,
}: {
  studentId: string;
  aircraft: Aircraft;
  existing: NonNullable<StudentDetail["pilotAircraftRates"]>[number] | null;
  onChanged: () => void;
}) {
  const [enabled, setEnabled] = useState(!!existing);
  const [priceInput, setPriceInput] = useState(
    ((existing?.customRateCents ?? aircraft.hourlyRateCents) / 100).toFixed(2)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setEnabled(next);
    setError(null);
    if (next) return; // on n'enregistre qu'au clic sur "Enregistrer" ci-dessous
    setSaving(true);
    try {
      await apiFetch(`/api/students/${studentId}/aircraft-rates/${aircraft.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setEnabled(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const euros = parseFloat(priceInput.replace(",", "."));
    if (!euros || euros <= 0) {
      setError("Indique un tarif valide.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/students/${studentId}/aircraft-rates/${aircraft.id}`, {
        method: "PUT",
        body: JSON.stringify({ customRateCents: Math.round(euros * 100) }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-navy-100 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy-900">{aircraft.registration}</p>
          <p className="text-xs text-navy-500">
            {aircraft.type} · tarif standard {formatMoney(aircraft.hourlyRateCents)}/h
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-navy-600 shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          Tarif dérogatoire
        </label>
      </div>
      {enabled && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            disabled={saving}
            className="rounded-lg border border-navy-100 px-2 py-1.5 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-sunset-500 w-28"
          />
          <span className="text-xs text-navy-500">€/h</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="ml-auto text-xs font-semibold text-sunset-600 hover:text-sunset-700 disabled:opacity-40"
          >
            {saving ? "..." : existing ? "Mettre à jour" : "Activer"}
          </button>
        </div>
      )}
      {error && <p className="text-red-600 text-xs mt-1.5">{error}</p>}
    </div>
  );
}

function EditStudentModal({
  student,
  onClose,
  onSaved,
}: {
  student: StudentDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(student.firstName);
  const [lastName, setLastName] = useState(student.lastName);
  const [phone, setPhone] = useState(student.phone ?? "");
  const [licenseType, setLicenseType] = useState(student.studentProfile?.licenseType ?? "");
  const [licenseNumber, setLicenseNumber] = useState(student.studentProfile?.licenseNumber ?? "");
  const [medicalExpiry, setMedicalExpiry] = useState(
    student.studentProfile?.medicalExpiry ? student.studentProfile.medicalExpiry.slice(0, 10) : ""
  );
  const [notes, setNotes] = useState(student.studentProfile?.notes ?? "");
  const [isPilot, setIsPilot] = useState(student.studentProfile?.isPilot ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/students/${student.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone || null,
          licenseType: licenseType || null,
          licenseNumber: licenseNumber || null,
          medicalExpiry: medicalExpiry || null,
          notes: notes || null,
          isPilot,
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
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">Modifier les informations</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="input"
            />
            <input
              required
              placeholder="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="input"
            />
          </div>
          <p className="text-xs text-navy-500 -mt-1">
            Email : {student.email} (non modifiable ici — c&apos;est l&apos;identifiant de connexion)
          </p>
          <input
            placeholder="Téléphone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
          />
          <input
            placeholder="Licence (ex: PPL, LAPL)"
            value={licenseType}
            onChange={(e) => setLicenseType(e.target.value)}
            className="input"
          />
          <input
            placeholder="Numéro de licence"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            className="input"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Échéance certificat médical</span>
            <input
              type="date"
              value={medicalExpiry}
              onChange={(e) => setMedicalExpiry(e.target.value)}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Notes internes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-16"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-navy-700 rounded-lg border border-navy-100 px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={isPilot} onChange={(e) => setIsPilot(e.target.checked)} />
            Pilote déjà breveté (plutôt qu&apos;élève en formation)
          </label>
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
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

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-navy-50 rounded-xl p-3">
      <p className={`text-sm font-bold ${danger ? "text-red-600" : "text-navy-900"}`}>{value}</p>
      <p className="text-[11px] text-navy-600">{label}</p>
    </div>
  );
}
