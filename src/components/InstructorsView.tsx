"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { UserLite } from "@/types/models";
import { formatMoney } from "@/lib/format";
import { Plus, Search, X, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function InstructorsView() {
  const [instructors, setInstructors] = useState<UserLite[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<UserLite | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<UserLite[]>("/api/instructors");
      setInstructors(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = instructors.filter((i) =>
    `${i.firstName} ${i.lastName} ${i.email}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un instructeur..."
            className="input pl-9"
          />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Nouvel instructeur
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-navy-600 border-b border-navy-100">
              <th className="px-5 py-3 font-medium">Nom</th>
              <th className="px-5 py-3 font-medium">Qualifications</th>
              <th className="px-5 py-3 font-medium">Tarif instruction</th>
              <th className="px-5 py-3 font-medium">Couleur planning</th>
              <th className="px-5 py-3 font-medium">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {filtered.map((i) => (
              <tr
                key={i.id}
                onClick={() => setDetail(i)}
                className="cursor-pointer hover:bg-navy-50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-navy-900">
                  {i.firstName} {i.lastName}
                </td>
                <td className="px-5 py-3 text-navy-700">
                  {i.instructorProfile?.qualifications ?? "—"}
                </td>
                <td className="px-5 py-3 text-navy-700">
                  {i.instructorProfile?.hourlyRateCents
                    ? `${formatMoney(i.instructorProfile.hourlyRateCents)}/h`
                    : "—"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className="inline-block w-4 h-4 rounded-full border border-navy-100"
                    style={{ backgroundColor: i.instructorProfile?.color ?? "#0C2448" }}
                  />
                </td>
                <td className="px-5 py-3 text-navy-600">{i.email}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-navy-600">
                  Aucun instructeur trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showCreate && (
        <CreateInstructorModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {detail && (
        <InstructorDetailModal
          instructor={detail}
          onClose={() => setDetail(null)}
          onUpdated={() => {
            setDetail(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateInstructorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [color, setColor] = useState("#0C2448");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ tempPassword: string | null }>("/api/instructors", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          qualifications,
          hourlyRateCents: hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null,
          color,
          password: password || undefined,
        }),
      });
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
          <h2 className="font-semibold text-navy-900">Nouvel instructeur</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>

        {created ? (
          <div className="p-5 flex flex-col gap-3">
            {tempPassword ? (
              <>
                <p className="text-sm text-navy-700">
                  Compte créé. Mot de passe temporaire à communiquer à l&apos;instructeur :
                </p>
                <p className="font-mono text-sm bg-navy-50 rounded-lg px-3 py-2">{tempPassword}</p>
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
            <input
              placeholder="Qualifications (ex: FI(A), IRI)"
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              className="input"
            />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <input
                type="number"
                step="0.01"
                placeholder="Tarif instruction €/h (optionnel, tarif par défaut)"
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
            {error && (
              <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Création..." : "Créer l'instructeur"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function InstructorDetailModal({
  instructor,
  onClose,
  onUpdated,
}: {
  instructor: UserLite;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [firstName, setFirstName] = useState(instructor.firstName);
  const [lastName, setLastName] = useState(instructor.lastName);
  const [email, setEmail] = useState(instructor.email);
  const [phone, setPhone] = useState(instructor.phone ?? "");
  const [qualifications, setQualifications] = useState(
    instructor.instructorProfile?.qualifications ?? ""
  );
  const [hourlyRate, setHourlyRate] = useState(
    instructor.instructorProfile?.hourlyRateCents
      ? String(instructor.instructorProfile.hourlyRateCents / 100)
      : ""
  );
  const [color, setColor] = useState(instructor.instructorProfile?.color ?? "#0C2448");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/instructors/${instructor.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone: phone || null,
          qualifications: qualifications || null,
          hourlyRateCents: hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null,
          color,
        }),
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">
            {instructor.firstName} {instructor.lastName}
          </h2>
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
          <input
            placeholder="Qualifications"
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
            className="input"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <input
              type="number"
              step="0.01"
              placeholder="Tarif instruction €/h"
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
          {error && (
            <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>

        <div className="px-5 pb-5 border-t border-navy-100 pt-4">
          <Link
            href={`/licences?person=${instructor.id}`}
            className="flex items-center gap-1.5 text-sm text-sunset-600 hover:underline w-fit"
          >
            <ShieldCheck size={15} /> Voir ses licences &amp; qualifications
          </Link>
        </div>
      </div>
    </div>
  );
}
