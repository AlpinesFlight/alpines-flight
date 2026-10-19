"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { UserLite } from "@/types/models";
import { formatMoney } from "@/lib/format";
import { canManageFinance } from "@/lib/permissions";
import { Plus, Search, X, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function InstructorsView() {
  const { data: session } = useSession();
  // Part de l'instruction reversée aux FI : réglage financier, Gérant seul
  // (l'API ne la renvoie d'ailleurs qu'à lui).
  const isFinance = canManageFinance(session?.user?.role);
  const [instructors, setInstructors] = useState<UserLite[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
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
        {/* Création unifiée élève/pilote/FI depuis la page Élèves &
            pilotes (voir CreateMemberModal dans StudentsView.tsx) — pas de
            second formulaire de création ici. ?newRole=INSTRUCTOR ouvre ce
            formulaire directement avec l'onglet FI déjà sélectionné, sans
            quoi arriver ici pour ajouter un instructeur retombait par
            défaut sur Élève. */}
        <Link
          href="/eleves?newRole=INSTRUCTOR"
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Ajouter un nouveau membre
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-navy-600 border-b border-navy-100">
              <th className="px-5 py-3 font-medium">Nom</th>
              <th className="px-5 py-3 font-medium">Qualifications</th>
              <th className="px-5 py-3 font-medium">Tarif instruction</th>
              {isFinance && <th className="px-5 py-3 font-medium">Part reversée</th>}
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
                {isFinance && (
                  <td className="px-5 py-3 text-navy-700">
                    {i.instructorProfile?.instructionSharePct ?? 100} %
                  </td>
                )}
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
                <td colSpan={isFinance ? 6 : 5} className="px-5 py-8 text-center text-navy-600">
                  Aucun instructeur trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {detail && (
        <InstructorDetailModal
          instructor={detail}
          canEditShare={isFinance}
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

function InstructorDetailModal({
  instructor,
  canEditShare,
  onClose,
  onUpdated,
}: {
  instructor: UserLite;
  canEditShare: boolean;
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
  const [sharePct, setSharePct] = useState(String(instructor.instructorProfile?.instructionSharePct ?? 100));
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
          ...(canEditShare ? { instructionSharePct: Number(sharePct) } : {}),
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
          {canEditShare && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Part de l&apos;instruction reversée (%)</span>
              <input
                required
                type="number"
                min="0"
                max="100"
                step="1"
                value={sharePct}
                onChange={(e) => setSharePct(e.target.value)}
                className="input"
              />
              <span className="text-[11px] text-navy-500">
                À chaque vol d&apos;instruction facturé à un pilote, cette part de l&apos;instruction (selon la
                formation choisie) est créditée sur son compte pilote. S&apos;applique aux vols clôturés à
                partir de maintenant.
              </span>
            </label>
          )}
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
