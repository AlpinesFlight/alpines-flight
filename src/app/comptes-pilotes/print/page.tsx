import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import { canManageFinance } from "@/lib/permissions";
import Image from "next/image";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Formate une date "YYYY-MM-DD" issue de l'URL sans passer par un objet
// Date — évite tout risque de décalage de fuseau horaire pour un simple
// affichage de borne de période.
function formatIsoDateOnly(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Versement",
  FLIGHT_DEBIT: "Vol",
  ADJUSTMENT: "Ajustement",
};

export default async function BillingPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  // Relevé financier de toute l'école — réservé au Gérant.
  if (!canManageFinance(session.user.role)) redirect("/comptes-pilotes");

  const { from, to } = await searchParams;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(new Date(to).getTime() + 86_399_999) : null; // fin de journée incluse

  // Filtre sur confirmedAt (la date "effective" affichée partout ailleurs
  // dans l'appli, ex. BillingView), pas createdAt (date d'enregistrement de
  // la ligne) : un versement peut être déclaré un jour et confirmé
  // plusieurs jours plus tard une fois le virement vérifié — c'est la date
  // de confirmation qui doit tomber dans la période choisie. Toujours
  // non-null ici puisque status est filtré sur CONFIRMED.
  const transactions = await prisma.accountTransaction.findMany({
    where: {
      status: "CONFIRMED",
      ...(fromDate || toDate
        ? { confirmedAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
    },
    include: { student: true, flightLog: { include: { aircraft: true } } },
    orderBy: [{ student: { lastName: "asc" } }, { confirmedAt: "asc" }],
  });

  const byStudent = new Map<string, { name: string; rows: typeof transactions }>();
  for (const t of transactions) {
    const key = t.studentId;
    const entry = byStudent.get(key) ?? { name: `${t.student.firstName} ${t.student.lastName}`, rows: [] };
    entry.rows.push(t);
    byStudent.set(key, entry);
  }

  const totalDeposits = transactions.filter((t) => t.type === "DEPOSIT").reduce((s, t) => s + t.amountCents, 0);
  const totalDebits = transactions
    .filter((t) => t.type === "FLIGHT_DEBIT")
    .reduce((s, t) => s + t.amountCents, 0);
  const totalAdjustments = transactions
    .filter((t) => t.type === "ADJUSTMENT")
    .reduce((s, t) => s + t.amountCents, 0);
  const grandTotal = totalDeposits + totalDebits + totalAdjustments;

  return (
    <div className="min-h-screen bg-white text-navy-900 print:bg-white">
      <PrintButton />
      <div className="max-w-3xl mx-auto p-10 print:p-0">
        <header className="flex items-center gap-4 border-b-2 border-navy-800 pb-4 mb-6">
          <Image src="/brand/logo-mark.png" alt="Alpines Flight" width={56} height={56} className="rounded-full" />
          <div>
            <h1 className="text-xl font-bold">Alpines Flight — Relevé des comptes pilotes</h1>
            <p className="text-sm text-navy-600">
              {from ? `Du ${formatIsoDateOnly(from)}` : "Depuis le début"}
              {to ? ` au ${formatIsoDateOnly(to)}` : " à aujourd'hui"}
            </p>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-4 gap-3 text-sm bg-navy-50 rounded-lg px-4 py-3">
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Versements</p>
            <p className="font-bold text-green-700">+{formatMoney(totalDeposits)}</p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Vols débités</p>
            <p className="font-bold text-red-600">{formatMoney(totalDebits)}</p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Ajustements</p>
            <p className="font-bold">
              {totalAdjustments >= 0 ? "+" : ""}
              {formatMoney(totalAdjustments)}
            </p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Mouvement net</p>
            <p className="font-bold">
              {grandTotal >= 0 ? "+" : ""}
              {formatMoney(grandTotal)}
            </p>
          </div>
        </section>

        {byStudent.size === 0 && (
          <p className="text-sm text-navy-600">Aucun mouvement confirmé sur cette période.</p>
        )}

        {Array.from(byStudent.values()).map((entry) => {
          const subtotal = entry.rows.reduce((s, t) => s + t.amountCents, 0);
          return (
            <div key={entry.name} className="mb-6 break-inside-avoid">
              <h3 className="text-sm font-semibold bg-navy-800 text-white px-3 py-1.5 rounded-t-lg">
                {entry.name}
              </h3>
              <table className="w-full text-xs border-collapse border border-t-0 border-navy-100 rounded-b-lg overflow-hidden">
                <thead>
                  <tr className="bg-navy-50 text-left text-navy-600">
                    <th className="px-3 py-1.5 font-medium">Date</th>
                    <th className="px-3 py-1.5 font-medium">Type</th>
                    <th className="px-3 py-1.5 font-medium">Détail</th>
                    <th className="px-3 py-1.5 font-medium text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.rows.map((t) => (
                    <tr key={t.id} className="border-t border-navy-100">
                      <td className="px-3 py-1.5 text-navy-500 whitespace-nowrap">
                        {formatDate(t.confirmedAt ?? t.createdAt)}
                      </td>
                      <td className="px-3 py-1.5">{TYPE_LABEL[t.type] ?? t.type}</td>
                      <td className="px-3 py-1.5 text-navy-600">
                        {t.type === "FLIGHT_DEBIT" && t.flightLog
                          ? `${t.flightLog.aircraft.registration} — ${t.flightLog.duration}h`
                          : (t.notes ?? "")}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right font-medium whitespace-nowrap ${
                          t.amountCents < 0 ? "text-red-600" : "text-green-700"
                        }`}
                      >
                        {t.amountCents >= 0 ? "+" : ""}
                        {formatMoney(t.amountCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-navy-200">
                    <td colSpan={3} className="px-3 py-1.5 font-bold">
                      Sous-total
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">
                      {subtotal >= 0 ? "+" : ""}
                      {formatMoney(subtotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}

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
