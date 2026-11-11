import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { isInstructorOrAbove } from "@/lib/permissions";
import { loadLicencesData } from "@/lib/qualifications";
import { linesByPerson } from "@/lib/licence-lines";
import { GROUP_LABEL, PersonGroup, ValidityState, personGroup, stateDetail } from "@/lib/qualification-catalog";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const STATE_CLASS: Record<ValidityState, string> = {
  expired: "text-red-600 font-semibold",
  missing: "text-red-600 font-semibold",
  dateMissing: "text-sunset-600 font-semibold",
  due: "text-sunset-600 font-semibold",
  pending: "text-navy-600",
  valid: "text-green-700",
  permanent: "text-navy-700",
  none: "text-navy-400",
};

const GROUPS: PersonGroup[] = ["INSTRUCTOR", "PILOT", "STUDENT", "OTHER"];

// État des licences et qualifications à la date du jour, pour l'école entière
// — ce qu'un contrôle (DSAC) demande à voir : pour chacun, ce qui est au
// dossier, jusqu'à quand c'est valide, ce qui manque, et si un justificatif
// est enregistré. Staff pédagogique uniquement, comme la vue d'ensemble.
export default async function LicencesPrintPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isInstructorOrAbove(session.user.role)) redirect("/licences");

  const data = await loadLicencesData();
  const now = new Date();
  const lines = linesByPerson(data.people, data.qualifications, now);

  return (
    <div className="min-h-screen bg-white text-navy-900 print:bg-white">
      <PrintButton />
      <div className="max-w-4xl mx-auto p-10 print:p-0">
        <header className="flex items-center gap-4 border-b-2 border-navy-800 pb-4 mb-6">
          <Image src="/brand/logo-mark.png" alt="Alpines Flight" width={56} height={56} className="rounded-full" />
          <div>
            <h1 className="text-xl font-bold">Alpines Flight — État des licences et qualifications</h1>
            <p className="text-sm text-navy-600">Au {formatDate(now)}</p>
          </div>
        </header>

        {GROUPS.map((group) => {
          const people = data.people.filter((p) => personGroup(p) === group);
          if (people.length === 0) return null;
          return (
            <section key={group} className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-navy-700 mb-2">
                {GROUP_LABEL[group]} ({people.length})
              </h2>
              <table className="w-full text-xs border-collapse border border-navy-100">
                <thead>
                  <tr className="bg-navy-800 text-white text-left">
                    <th className="px-2.5 py-1.5 font-medium">Nom</th>
                    <th className="px-2.5 py-1.5 font-medium">Qualification</th>
                    <th className="px-2.5 py-1.5 font-medium">Détail</th>
                    <th className="px-2.5 py-1.5 font-medium">Fin de validité</th>
                    <th className="px-2.5 py-1.5 font-medium">État</th>
                    <th className="px-2.5 py-1.5 font-medium">Justificatif</th>
                  </tr>
                </thead>
                {people.map((p) => {
                  const personLines = lines.get(p.id) ?? [];
                  return (
                    <tbody key={p.id} className="break-inside-avoid border-t-2 border-navy-200">
                      {personLines.length === 0 && (
                        <tr>
                          <td className="px-2.5 py-1.5 font-semibold whitespace-nowrap">
                            {p.firstName} {p.lastName}
                          </td>
                          <td colSpan={5} className="px-2.5 py-1.5 text-navy-500">
                            Rien au dossier
                          </td>
                        </tr>
                      )}
                      {personLines.map((line, i) => (
                        <tr key={line.key} className="border-t border-navy-100 align-top">
                          <td className="px-2.5 py-1.5 font-semibold whitespace-nowrap">
                            {i === 0 ? `${p.firstName} ${p.lastName}` : ""}
                          </td>
                          <td className="px-2.5 py-1.5">{line.label}</td>
                          <td className="px-2.5 py-1.5 text-navy-600">
                            {[line.current?.variant, line.current?.number ? `n° ${line.current.number}` : null]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                          <td className="px-2.5 py-1.5 whitespace-nowrap">
                            {line.current?.expiresAt ? formatDate(line.current.expiresAt) : "—"}
                          </td>
                          <td className={`px-2.5 py-1.5 whitespace-nowrap ${STATE_CLASS[line.state]}`}>
                            {stateDetail(line.state, line.days)}
                          </td>
                          <td className="px-2.5 py-1.5 whitespace-nowrap">
                            {!line.current ? "—" : line.current.documentIds.length > 0 ? "Oui" : "Non"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </section>
          );
        })}

        <p className="text-[10px] text-navy-500">
          Obligatoire au dossier : instructeurs — licence, certificat médical, SEP et FI ; pilotes — licence, certificat
          médical et SEP (sauf LAPL) ; élèves — certificat médical. « À renouveler » : dans la période de rappel avant
          l&apos;échéance.
        </p>
        <p className="text-[10px] text-navy-400 mt-6 text-center">
          Document généré le {formatDate(now)} par {session.user.name} — Alpines Flight, DTO n°0889
        </p>
      </div>
    </div>
  );
}
