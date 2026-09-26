"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { AccountTransaction, SchoolSettings, UserLite } from "@/types/models";
import { formatDate, formatHoursMinutes, formatMoney } from "@/lib/format";
import { Plus, X, Check, Ban, Clock, FileDown, FileText, Pencil, Trash2, Landmark, PiggyBank } from "lucide-react";
import { clsx } from "clsx";

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Versement",
  FLIGHT_DEBIT: "Vol",
  ADJUSTMENT: "Ajustement",
};

const METHOD_LABEL: Record<string, string> = {
  CARD: "Carte",
  TRANSFER: "Virement",
  CASH: "Espèces",
  CHECK: "Chèque",
};

// Valeur d'un <input type="date"> (jour LOCAL) — ne jamais passer par
// toISOString().slice(0, 10), qui donne le jour UTC (la veille juste après
// minuit en France).
function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Reconstruit le détail d'un vol directement depuis le FlightLog relié
// (toujours à jour, en heures et minutes) plutôt que de rejouer le texte
// figé dans AccountTransaction.notes à la création — ça affiche
// correctement même les vols enregistrés avant ce format-ci ou avec un
// texte différent (ex. l'ancien "Vol antérieur saisi manuellement...").
function flightDebitDetail(t: AccountTransaction): string {
  if (!t.flightLog) return t.notes ?? "";
  const parts = [`Avion ${t.flightLog.aircraft.registration} — ${formatHoursMinutes(t.flightLog.duration)}`];
  if (t.flightLog.instructionCostCents > 0) {
    parts.push(`Instruction — ${formatHoursMinutes(t.flightLog.duration)}`);
  }
  return parts.join(" + ");
}

export function BillingView() {
  const { data: session, status: sessionStatus } = useSession();
  // Le Gérant seul gère les finances de tout le monde (résumé global, export
  // PDF, IBAN, édition/suppression de mouvements) — voir src/lib/permissions.ts.
  // Tout autre compte (Admin compris : "tout sauf les finances") n'a accès
  // qu'à son propre compte pilote en libre-service : solde, historique,
  // déclarer un versement.
  const canFinanceAdmin = session?.user?.role === "GERANT";
  const userId = session?.user?.id;
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [students, setStudents] = useState<UserLite[]>([]);
  const [self, setSelf] = useState<UserLite | null>(null);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showFlightsExport, setShowFlightsExport] = useState(false);
  const [showIban, setShowIban] = useState(false);
  const [editTx, setEditTx] = useState<AccountTransaction | null>(null);
  // Filtre d'affichage uniquement (Gérant) — pour retrouver rapidement tous
  // les mouvements (vols compris) d'un seul pilote, sans changer les
  // résumés ci-dessus qui restent toujours sur toute l'école.
  const [filterStudentId, setFilterStudentId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [tx, stu, set, me] = await Promise.all([
        apiFetch<AccountTransaction[]>("/api/transactions"),
        // withInstructors : les comptes des instructeurs sont aussi des comptes
        // pilotes (solde, filtre, versement, extrait de vols) — leurs noms
        // s'ajoutent simplement à la liste, sans distinction.
        canFinanceAdmin
          ? apiFetch<UserLite[]>("/api/students?withInstructors=true")
          : Promise.resolve<UserLite[]>([]),
        apiFetch<SchoolSettings>("/api/settings"),
        userId ? apiFetch<UserLite>(`/api/students/${userId}`) : Promise.resolve(null),
      ]);
      setTransactions(tx);
      setStudents(stu);
      setSettings(set);
      setSelf(me);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Attend que la session soit résolue avant de charger : sinon
    // canFinanceAdmin démarre à false (session pas encore hydratée côté
    // client), un premier chargement partiel part en vol, et rien ne
    // garantit qu'il se termine avant le second déclenché par la mise à
    // jour de canFinanceAdmin — le plus lent des deux écrase alors l'autre
    // (ex. solde Gérant à 0€ si le chargement "élève" termine après).
    if (sessionStatus === "loading") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, canFinanceAdmin, userId]);

  const pending = useMemo(
    () => transactions.filter((t) => t.status === "PENDING"),
    [transactions]
  );
  const history = useMemo(
    () => transactions.filter((t) => t.status !== "PENDING"),
    [transactions]
  );
  const filteredPending = useMemo(
    () => (filterStudentId ? pending.filter((t) => t.studentId === filterStudentId) : pending),
    [pending, filterStudentId]
  );
  const filteredHistory = useMemo(
    () => (filterStudentId ? history.filter((t) => t.studentId === filterStudentId) : history),
    [history, filterStudentId]
  );

  // Compte du pilote choisi dans le filtre : son solde et de quoi il est fait.
  // Seuls les mouvements confirmés comptent (un versement en attente n'a pas
  // encore crédité le compte) — c'est exactement ce que somme le solde stocké.
  const selectedAccount = useMemo<PilotAccount | null>(() => {
    const person = filterStudentId ? students.find((s) => s.id === filterStudentId) : undefined;
    if (!person) return null;
    const mine = transactions.filter((t) => t.studentId === person.id);
    const confirmed = mine.filter((t) => t.status === "CONFIRMED");
    const figure = (type: AccountTransaction["type"]) => {
      const rows = confirmed.filter((t) => t.type === type);
      return { count: rows.length, cents: rows.reduce((sum, t) => sum + t.amountCents, 0) };
    };
    const pendingRows = mine.filter((t) => t.status === "PENDING");
    return {
      person,
      balanceCents: person.studentProfile?.balanceCents ?? 0,
      deposits: figure("DEPOSIT"),
      flights: figure("FLIGHT_DEBIT"),
      adjustments: figure("ADJUSTMENT"),
      pendingCount: pendingRows.length,
      pendingCents: pendingRows.reduce((sum, t) => sum + t.amountCents, 0),
    };
  }, [filterStudentId, students, transactions]);

  const summary = useMemo(() => {
    const balances = students.map((s) => s.studentProfile?.balanceCents ?? 0);
    const totalBalance = balances.reduce((sum, b) => sum + b, 0);
    const totalCreditor = balances.filter((b) => b > 0).reduce((sum, b) => sum + b, 0);
    const totalDebtor = balances.filter((b) => b < 0).reduce((sum, b) => sum + b, 0);
    const negativeCount = balances.filter((b) => b < 0).length;
    const pendingTotal = pending.reduce((sum, t) => sum + t.amountCents, 0);
    return { totalBalance, totalCreditor, totalDebtor, negativeCount, pendingTotal };
  }, [students, pending]);

  async function handleConfirm(id: string, action: "CONFIRM" | "REJECT") {
    await apiFetch(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    load();
  }

  async function handleDeleteTx(t: AccountTransaction) {
    // Pour un vol (FLIGHT_DEBIT), "supprimer" ce mouvement ne supprime pas
    // le vol lui-même (voir /api/transactions/[id]) — seulement sa valeur :
    // le solde est recrédité et le coût du vol remis à 0€, mais le vol
    // reste dans le carnet (heures, atterrissages...). Utile pour un vol
    // antérieur déjà réglé autrement avant d'être saisi dans l'appli.
    const message =
      t.type === "FLIGHT_DEBIT"
        ? `Retirer la valeur de ce vol (${t.student.firstName} ${t.student.lastName} · ${formatMoney(t.amountCents)}) ? Le solde sera recrédité et le vol repassera à 0€, mais il restera enregistré dans le carnet (heures, atterrissages...).`
        : `Supprimer ce mouvement (${t.student.firstName} ${t.student.lastName} · ${formatMoney(t.amountCents)}) ?` +
          (t.status === "CONFIRMED" ? " Le solde du pilote sera recrédité/redébité en conséquence." : "");
    if (!window.confirm(message)) return;
    await apiFetch(`/api/transactions/${t.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap justify-end gap-2 mb-5">
        {canFinanceAdmin && (
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <FileDown size={16} /> Exporter en PDF
          </button>
        )}
        {canFinanceAdmin && (
          <button
            onClick={() => setShowFlightsExport(true)}
            className="flex items-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <FileText size={16} /> Extrait de vols (par pilote)
          </button>
        )}
        <button
          onClick={() => setShowDeposit(true)}
          className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Plus size={16} /> Déclarer un versement
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-4 mb-6">
        {canFinanceAdmin ? (
          <>
            <SummaryCard
              icon={PiggyBank}
              label="Solde total des comptes pilotes"
              value={formatMoney(summary.totalBalance)}
              detail={`dont ${formatMoney(summary.totalCreditor)} créditeur et ${formatMoney(summary.totalDebtor)} débiteur`}
            />
            <SummaryCard
              icon={Clock}
              label="En attente de vérification"
              value={formatMoney(summary.pendingTotal)}
              detail={`${pending.length} versement(s) déclaré(s), ${summary.negativeCount} compte(s) à solde négatif`}
            />
          </>
        ) : (
          <SummaryCard
            icon={PiggyBank}
            label="Mon solde"
            value={formatMoney(self?.studentProfile?.balanceCents ?? 0)}
            detail={
              pending.length > 0
                ? `${pending.length} versement(s) en attente de vérification`
                : "Aucun versement en attente"
            }
          />
        )}
        <IbanCard settings={settings} canEdit={canFinanceAdmin} onEdit={() => setShowIban(true)} />
      </div>

      {canFinanceAdmin && (
        <label className={clsx("flex flex-col gap-1 max-w-xs", selectedAccount ? "mb-3" : "mb-6")}>
          <span className="text-xs font-medium text-navy-600">
            Filtrer par compte pilote (versements et vols ci-dessous)
          </span>
          <select
            value={filterStudentId}
            onChange={(e) => setFilterStudentId(e.target.value)}
            className="input"
          >
            <option value="">— Tous les comptes —</option>
            {[...students]
              .sort((a, b) => a.lastName.localeCompare(b.lastName))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
          </select>
        </label>
      )}

      {canFinanceAdmin && selectedAccount && <PilotAccountCard account={selectedAccount} />}

      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden mb-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-navy-100">
          <Clock size={16} className="text-sunset-600" />
          <h2 className="font-semibold text-navy-900">
            Versements en attente de vérification
          </h2>
          {filteredPending.length > 0 && (
            <span className="ml-1 text-xs font-semibold bg-sunset-100 text-sunset-600 px-2 py-0.5 rounded-full">
              {filteredPending.length}
            </span>
          )}
        </div>
        <div className="divide-y divide-navy-100">
          {filteredPending.length === 0 && (
            <p className="px-5 py-6 text-sm text-navy-600">
              Aucun versement en attente.
            </p>
          )}
          {filteredPending.map((t) => (
            <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-navy-900">
                  {t.student.firstName} {t.student.lastName} · {formatMoney(t.amountCents)}
                </p>
                <p className="text-xs text-navy-600">
                  {t.method ? METHOD_LABEL[t.method] : "Versement"} du {formatDate(t.date)}
                  {t.reference ? ` · réf. ${t.reference}` : ""}
                  {t.notes ? ` · ${t.notes}` : ""}
                </p>
              </div>
              {canFinanceAdmin ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleConfirm(t.id, "REJECT")}
                    className="flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-100 rounded-lg px-2.5 py-1.5"
                  >
                    <Ban size={14} /> Rejeter
                  </button>
                  <button
                    onClick={() => handleConfirm(t.id, "CONFIRM")}
                    className="flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg px-2.5 py-1.5"
                  >
                    <Check size={14} /> Confirmer &amp; créditer
                  </button>
                </div>
              ) : (
                <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-navy-500">
                  <Clock size={13} /> En attente de vérification
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Historique des mouvements</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-navy-600 border-b border-navy-100">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Élève</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Détail</th>
              <th className="px-5 py-3 font-medium text-right">Montant</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              {canFinanceAdmin && <th className="px-5 py-3 font-medium" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {filteredHistory.map((t) => (
              <tr key={t.id} className="group">
                {/* Date de l'opération (vol, virement...), pas de la saisie. */}
                <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-5 py-3 text-navy-900 font-medium">
                  {t.student.firstName} {t.student.lastName}
                </td>
                <td className="px-5 py-3 text-navy-700">{TYPE_LABEL[t.type]}</td>
                <td className="px-5 py-3 text-navy-600">
                  {t.type === "DEPOSIT" &&
                    `${t.method ? METHOD_LABEL[t.method] : ""}${t.reference ? ` · ${t.reference}` : ""}`}
                  {t.type === "FLIGHT_DEBIT" && flightDebitDetail(t)}
                  {t.type === "ADJUSTMENT" && (t.notes ?? "")}
                </td>
                <td
                  className={clsx(
                    "px-5 py-3 text-right font-semibold whitespace-nowrap",
                    t.amountCents < 0 ? "text-red-600" : "text-green-700"
                  )}
                >
                  {t.amountCents >= 0 ? "+" : ""}
                  {formatMoney(t.amountCents)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={clsx(
                      "text-xs font-semibold px-2 py-1 rounded-full",
                      t.status === "CONFIRMED" && "bg-green-100 text-green-700",
                      t.status === "REJECTED" && "bg-navy-100 text-navy-500"
                    )}
                  >
                    {t.status === "CONFIRMED" ? "Confirmé" : "Rejeté"}
                  </span>
                </td>
                {canFinanceAdmin && (
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditTx(t)}
                        title="Modifier"
                        className="text-navy-500 hover:text-navy-900 hover:bg-navy-50 rounded-lg p-1.5"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteTx(t)}
                        title={t.type === "FLIGHT_DEBIT" ? "Retirer la valeur (le vol reste au carnet)" : "Supprimer"}
                        className="text-navy-500 hover:text-red-600 hover:bg-red-100 rounded-lg p-1.5"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!loading && filteredHistory.length === 0 && (
              <tr>
                <td colSpan={canFinanceAdmin ? 7 : 6} className="px-5 py-8 text-center text-navy-600">
                  Aucun mouvement pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showDeposit && (
        <DeclareDepositModal
          students={students}
          canPickRecipient={canFinanceAdmin}
          self={self}
          onClose={() => setShowDeposit(false)}
          onCreated={() => {
            setShowDeposit(false);
            load();
          }}
        />
      )}

      {showExport && <ExportPdfModal onClose={() => setShowExport(false)} />}

      {showFlightsExport && (
        <ExportFlightsPdfModal students={students} onClose={() => setShowFlightsExport(false)} />
      )}

      {showIban && (
        <EditIbanModal
          settings={settings}
          onClose={() => setShowIban(false)}
          onSaved={(fresh) => {
            setSettings(fresh);
            setShowIban(false);
          }}
        />
      )}

      {editTx && (
        <EditTransactionModal
          transaction={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => {
            setEditTx(null);
            load();
          }}
        />
      )}
    </div>
  );
}

interface PilotAccount {
  person: UserLite;
  balanceCents: number;
  deposits: { count: number; cents: number };
  flights: { count: number; cents: number };
  adjustments: { count: number; cents: number };
  pendingCount: number;
  pendingCents: number;
}

// "+" explicite devant un montant positif (formatMoney met déjà le "-").
function signedMoney(cents: number) {
  return `${cents > 0 ? "+" : ""}${formatMoney(cents)}`;
}

// Le compte d'UN pilote : son solde — créditeur (positif), débiteur (négatif)
// ou nul — et le calcul qui y mène : versements confirmés, vols débités,
// éventuels ajustements. Affiché quand un pilote est choisi dans le filtre.
function PilotAccountCard({ account }: { account: PilotAccount }) {
  const { person, balanceCents, deposits, flights, adjustments, pendingCount, pendingCents } = account;
  const tone =
    balanceCents > 0
      ? { label: "Créditeur", accent: "border-l-green-600", text: "text-green-700", badge: "bg-green-100 text-green-700" }
      : balanceCents < 0
        ? { label: "Débiteur", accent: "border-l-red-600", text: "text-red-600", badge: "bg-red-100 text-red-600" }
        : { label: "Solde nul", accent: "border-l-navy-200", text: "text-navy-900", badge: "bg-navy-100 text-navy-600" };

  return (
    <div className={clsx("bg-white rounded-2xl border border-navy-100 border-l-4 p-5 mb-6 max-w-lg", tone.accent)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-navy-600 truncate">
            Solde de {person.firstName} {person.lastName}
          </p>
          <p className={clsx("text-2xl font-bold leading-tight whitespace-nowrap", tone.text)}>
            {signedMoney(balanceCents)}
          </p>
        </div>
        <span className={clsx("shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full", tone.badge)}>
          {tone.label}
        </span>
      </div>
      <dl className="mt-4 pt-3 border-t border-navy-100 text-sm flex flex-col gap-1.5">
        <AccountLine label="Versements confirmés" count={deposits.count} cents={deposits.cents} />
        <AccountLine label="Vols" count={flights.count} cents={flights.cents} />
        {adjustments.count > 0 && (
          <AccountLine label="Ajustements" count={adjustments.count} cents={adjustments.cents} />
        )}
      </dl>
      {pendingCount > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-navy-600">
          <Clock size={12} className="shrink-0" />
          {formatMoney(pendingCents)} en attente de vérification — pas encore compté dans le solde.
        </p>
      )}
    </div>
  );
}

function AccountLine({ label, count, cents }: { label: string; count: number; cents: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-navy-600">
        {label} <span className="text-navy-400">({count})</span>
      </dt>
      <dd
        className={clsx(
          "font-semibold whitespace-nowrap",
          cents < 0 ? "text-red-600" : cents > 0 ? "text-green-700" : "text-navy-500"
        )}
      >
        {signedMoney(cents)}
      </dd>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-navy-100 text-navy-800 flex items-center justify-center shrink-0">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-navy-900 leading-tight">{value}</p>
        <p className="text-xs text-navy-600">{label}</p>
        <p className="text-[11px] text-navy-400 truncate">{detail}</p>
      </div>
    </div>
  );
}

function IbanCard({
  settings,
  canEdit,
  onEdit,
}: {
  settings: SchoolSettings | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const hasIban = !!settings?.iban;
  return (
    <div className="bg-navy-800 rounded-2xl p-5 flex flex-col gap-2 lg:w-96 shrink-0">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-cream-50 uppercase tracking-wide">
          <Landmark size={14} /> Coordonnées bancaires
        </span>
        {canEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-xs font-medium text-navy-200 hover:text-white"
          >
            <Pencil size={13} /> Modifier
          </button>
        )}
      </div>
      {hasIban ? (
        <div className="text-sm text-cream-50">
          {settings?.ibanHolder && <p className="font-medium">{settings.ibanHolder}</p>}
          {/* Un IBAN complet ne tient pas en text-sm sur une largeur de
              carte raisonnable — plus petit et sans tracking-wide (qui
              n'apporte rien à la lisibilité d'un simple code à recopier),
              overflow-x-auto en filet de sécurité si jamais ça ne suffit
              toujours pas (ex: IBAN étranger plus long). */}
          <p className="font-mono text-xs whitespace-nowrap overflow-x-auto">{settings?.iban}</p>
          {settings?.bic && <p className="text-navy-200 text-xs">BIC : {settings.bic}</p>}
          {settings?.bankName && <p className="text-navy-200 text-xs">{settings.bankName}</p>}
        </div>
      ) : (
        <p className="text-sm text-navy-200">
          {canEdit ? "Aucun IBAN renseigné — clique sur « Modifier » pour l'ajouter." : "IBAN non renseigné."}
        </p>
      )}
    </div>
  );
}

function EditIbanModal({
  settings,
  onClose,
  onSaved,
}: {
  settings: SchoolSettings | null;
  onClose: () => void;
  onSaved: (fresh: SchoolSettings) => void;
}) {
  const [ibanHolder, setIbanHolder] = useState(settings?.ibanHolder ?? "");
  const [iban, setIban] = useState(settings?.iban ?? "");
  const [bic, setBic] = useState(settings?.bic ?? "");
  const [bankName, setBankName] = useState(settings?.bankName ?? "");
  const [notes, setNotes] = useState(settings?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const fresh = await apiFetch<SchoolSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ibanHolder: ibanHolder || null,
          iban: iban || null,
          bic: bic || null,
          bankName: bankName || null,
          notes: notes || null,
        }),
      });
      onSaved(fresh);
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
          <h2 className="font-semibold text-navy-900">Coordonnées bancaires</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <p className="text-xs text-navy-600 -mt-1">
            Affiché aux pilotes sur la page Comptes pilotes, pour qu&apos;ils
            sachent où virer leur versement.
          </p>
          <input
            placeholder="Titulaire du compte"
            value={ibanHolder}
            onChange={(e) => setIbanHolder(e.target.value)}
            className="input"
          />
          <input
            placeholder="IBAN"
            value={iban}
            onChange={(e) => setIban(e.target.value.toUpperCase())}
            className="input font-mono"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="BIC"
              value={bic}
              onChange={(e) => setBic(e.target.value.toUpperCase())}
              className="input font-mono"
            />
            <input
              placeholder="Banque"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="input"
            />
          </div>
          <textarea
            placeholder="Notes / instructions complémentaires (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-14"
          />
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

function EditTransactionModal({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: AccountTransaction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState(transaction.type);
  const [amount, setAmount] = useState(String(Math.abs(transaction.amountCents) / 100));
  const [negative, setNegative] = useState(transaction.amountCents < 0);
  const [method, setMethod] = useState(transaction.method ?? "TRANSFER");
  const [reference, setReference] = useState(transaction.reference ?? "");
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [initialDate] = useState(() => toDateInput(new Date(transaction.date)));
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const magnitude = Math.round(parseFloat(amount) * 100);
      await apiFetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          type,
          amountCents: negative ? -magnitude : magnitude,
          method: type === "DEPOSIT" ? method : null,
          reference: reference || null,
          notes: notes || null,
          // Seulement si elle a été modifiée : sinon la date exacte déjà
          // enregistrée (ex. l'heure d'un vol) resterait intacte.
          ...(date !== initialDate && !transaction.flightLogId ? { date } : {}),
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
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">
            Modifier le mouvement — {transaction.student.firstName} {transaction.student.lastName}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          {transaction.status === "CONFIRMED" && (
            <p className="text-xs text-navy-600 -mt-1">
              Ce mouvement est déjà confirmé : le solde du pilote sera ajusté
              du delta si tu changes le montant.
            </p>
          )}
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input">
            <option value="DEPOSIT">Versement</option>
            <option value="FLIGHT_DEBIT">Vol</option>
            <option value="ADJUSTMENT">Ajustement</option>
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <input
              required
              type="number"
              step="0.01"
              min="0"
              placeholder="Montant (€)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
            />
            <select
              value={negative ? "NEG" : "POS"}
              onChange={(e) => setNegative(e.target.value === "NEG")}
              className="input w-28"
            >
              <option value="POS">Crédit +</option>
              <option value="NEG">Débit −</option>
            </select>
          </div>
          {transaction.flightLogId ? (
            <p className="text-xs text-navy-600 bg-navy-50 rounded-lg px-3 py-2">
              Date du vol : {formatDate(transaction.date)} — elle se corrige depuis la page Vols.
            </p>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">
                {type === "DEPOSIT" ? "Date du versement" : "Date de l'opération"}
              </span>
              <input
                required
                type="date"
                max={toDateInput(new Date())}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </label>
          )}
          {type === "DEPOSIT" && (
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="input">
              <option value="TRANSFER">Virement</option>
              <option value="CARD">Carte bancaire</option>
              <option value="CASH">Espèces</option>
              <option value="CHECK">Chèque</option>
            </select>
          )}
          <input
            placeholder="Référence (optionnel)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="input"
          />
          <textarea
            placeholder="Notes (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-14"
          />
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

function ExportPdfModal({ onClose }: { onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  function handleExport(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    window.open(`/comptes-pilotes/print?${params.toString()}`, "_blank");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Exporter en PDF</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleExport} className="p-5 flex flex-col gap-3">
          <p className="text-xs text-navy-600 -mt-1">
            Relevé des mouvements confirmés (versements, vols, ajustements)
            sur la période choisie, par élève.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Du</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Au</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
            </label>
          </div>
          <button
            type="submit"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm transition-colors"
          >
            <FileDown size={16} /> Générer le PDF
          </button>
        </form>
      </div>
    </div>
  );
}

// Extrait de vols d'UN pilote/élève sur une période — sert de justificatif
// (facture, assurance...), voir /vols/print. Distinct du relevé financier
// ci-dessus : ici le détail vol par vol (avion, trajet, durée,
// atterrissages) pour une seule personne, pas le grand livre de l'école.
function ExportFlightsPdfModal({
  students,
  onClose,
}: {
  students: UserLite[];
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  function handleExport(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    const params = new URLSearchParams({ studentId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    window.open(`/vols/print?${params.toString()}`, "_blank");
    onClose();
  }

  const sorted = [...students].sort((a, b) => a.lastName.localeCompare(b.lastName));

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Extrait de vols</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleExport} className="p-5 flex flex-col gap-3">
          <p className="text-xs text-navy-600 -mt-1">
            Détail des vols (avion, trajet, durée, atterrissages, coût) d&apos;un pilote sur la
            période choisie — utile comme justificatif.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Pilote / élève</span>
            <select
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="input"
            >
              <option value="" disabled>
                Choisir...
              </option>
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Du</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Au</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
            </label>
          </div>
          <button
            type="submit"
            disabled={!studentId}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm transition-colors disabled:opacity-60"
          >
            <FileDown size={16} /> Générer le PDF
          </button>
        </form>
      </div>
    </div>
  );
}

function DeclareDepositModal({
  students,
  canPickRecipient,
  self,
  onClose,
  onCreated,
}: {
  students: UserLite[];
  canPickRecipient: boolean;
  self: UserLite | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState(
    canPickRecipient ? students[0]?.id ?? "" : self?.id ?? ""
  );
  const [amount, setAmount] = useState("");
  // Date du virement — pas celle de la déclaration : c'est elle qui classe le
  // versement dans l'historique.
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [method, setMethod] = useState<"TRANSFER" | "CARD" | "CASH" | "CHECK">("TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: "DEPOSIT",
          studentId,
          amountCents: Math.round(parseFloat(amount) * 100),
          date,
          method,
          reference: reference || null,
          notes: notes || null,
        }),
      });
      onCreated();
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
          <h2 className="font-semibold text-navy-900">Déclarer un versement</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <p className="text-xs text-navy-600 -mt-1">
            Le solde ne sera crédité qu&apos;après vérification du virement par l&apos;école.
          </p>
          {canPickRecipient ? (
            <select
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="input"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-navy-700 bg-navy-50 rounded-lg px-3 py-2">
              Sur ton compte pilote{self ? ` (${self.firstName} ${self.lastName})` : ""}
            </p>
          )}
          <input
            required
            type="number"
            step="0.01"
            placeholder="Montant viré (€)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Date du virement / versement</span>
            <input
              required
              type="date"
              max={toDateInput(new Date())}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </label>
          <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="input">
            <option value="TRANSFER">Virement</option>
            <option value="CARD">Carte bancaire</option>
            <option value="CASH">Espèces</option>
            <option value="CHECK">Chèque</option>
          </select>
          <input
            placeholder="Référence du virement (optionnel)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="input"
          />
          <textarea
            placeholder="Note (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input min-h-16"
          />
          {error && (
            <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving || !studentId}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Envoi..." : "Déclarer le versement"}
          </button>
        </form>
      </div>
    </div>
  );
}
