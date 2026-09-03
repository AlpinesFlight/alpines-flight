import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatDate, formatHoursMinutes, formatMoney } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import { canManageFinance } from "@/lib/permissions";
import Image from "next/image";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Formate une date "YYYY-MM-DD" issue de l'URL sans passer par un objet
// Date — évite tout risque de décalage de fuseau horaire pour un simple
// affichage de borne de période (même technique que .../comptes-pilotes/print).
function formatIsoDateOnly(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Extrait de vols pour UN pilote/élève sur une période choisie — utile
// comme justificatif d'activité (facture, assurance...). Réservé au Gérant :
// mêmes droits que le relevé financier (.../comptes-pilotes/print), ce
// document nomme aussi des montants facturés.
export default async function FlightsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canManageFinance(session.user.role)) redirect("/vols");

  const { studentId, from, to } = await searchParams;
  if (!studentId) redirect("/comptes-pilotes");

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true, studentProfile: { select: { licenseType: true } } },
  });
  if (!student) redirect("/comptes-pilotes");

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(new Date(to).getTime() + 86_399_999) : null; // fin de journée incluse

  const flights = await prisma.flightLog.findMany({
    where: {
      studentId,
      ...(fromDate || toDate
        ? { date: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
    },
    include: { aircraft: { select: { registration: true, type: true } }, instructor: { select: { firstName: true, lastName: true } } },
    orderBy: { date: "asc" },
  });

  const totalHours = flights.reduce((s, f) => s + f.duration, 0);
  const totalLandings = flights.reduce((s, f) => s + f.totalLandings, 0);
  const totalCostCents = flights.reduce((s, f) => s + f.aircraftCostCents + f.instructionCostCents, 0);

  return (
    <div className="min-h-screen bg-white text-navy-900 print:bg-white">
      <PrintButton />
      <div className="max-w-3xl mx-auto p-10 print:p-0">
        <header className="flex items-center gap-4 border-b-2 border-navy-800 pb-4 mb-6">
          <Image src="/brand/logo-mark.png" alt="Alpines Flight" width={56} height={56} className="rounded-full" />
          <div>
            <h1 className="text-xl font-bold">Alpines Flight — Extrait de vols</h1>
            <p className="text-sm text-navy-600">
              {student.firstName} {student.lastName}
              {student.studentProfile?.licenseType ? ` — ${student.studentProfile.licenseType}` : ""}
            </p>
            <p className="text-xs text-navy-500">
              {from ? `Du ${formatIsoDateOnly(from)}` : "Depuis le début"}
              {to ? ` au ${formatIsoDateOnly(to)}` : " à aujourd'hui"}
            </p>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-3 gap-3 text-sm bg-navy-50 rounded-lg px-4 py-3">
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Vols</p>
            <p className="font-bold">{flights.length}</p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Heures de vol</p>
            <p className="font-bold">{formatHoursMinutes(totalHours)}</p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Atterrissages</p>
            <p className="font-bold">{totalLandings}</p>
          </div>
        </section>

        {flights.length === 0 ? (
          <p className="text-sm text-navy-600">Aucun vol sur cette période.</p>
        ) : (
          <table className="w-full text-xs border-collapse border border-navy-100 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-navy-800 text-white text-left">
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 font-medium">Avion</th>
                <th className="px-3 py-1.5 font-medium">Instructeur</th>
                <th className="px-3 py-1.5 font-medium">Trajet</th>
                <th className="px-3 py-1.5 font-medium text-right">Durée</th>
                <th className="px-3 py-1.5 font-medium text-right">Att.</th>
                <th className="px-3 py-1.5 font-medium text-right">Coût</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => (
                <tr key={f.id} className="border-t border-navy-100">
                  <td className="px-3 py-1.5 text-navy-600 whitespace-nowrap">{formatDate(f.date)}</td>
                  <td className="px-3 py-1.5 font-medium">{f.aircraft.registration}</td>
                  <td className="px-3 py-1.5 text-navy-600">
                    {f.instructor ? `${f.instructor.firstName} ${f.instructor.lastName}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-navy-600 whitespace-nowrap">
                    {f.departureAirfield && f.arrivalAirfield ? `${f.departureAirfield} → ${f.arrivalAirfield}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatHoursMinutes(f.duration)}</td>
                  <td className="px-3 py-1.5 text-right">{f.totalLandings}</td>
                  <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap">
                    {formatMoney(f.aircraftCostCents + f.instructionCostCents)}
                    {f.isBaptism && " (baptême)"}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-navy-800">
                <td colSpan={4} className="px-3 py-1.5 font-bold">
                  Total
                </td>
                <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">{formatHoursMinutes(totalHours)}</td>
                <td className="px-3 py-1.5 text-right font-bold">{totalLandings}</td>
                <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">{formatMoney(totalCostCents)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <p className="text-[10px] text-navy-400 mt-8 text-center">
          Document généré le {formatDate(new Date().toISOString())} — Alpines Flight, DTO n°0889
        </p>
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
