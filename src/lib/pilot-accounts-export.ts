import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// Export Excel des comptes pilotes pour la comptabilité (bilan) : par client,
// ce qui a été vendu (versements = heures de vol prépayées) et consommé
// (vols débités) sur une période, avec les soldes de début et de fin — plus
// le détail des mouvements. Réservé au Gérant (voir
// /api/transactions/export). Seuls les mouvements CONFIRMÉS comptent, comme
// pour les soldes de l'appli (un versement déclaré mais pas encore vérifié
// sur le relevé bancaire est listé à part, sans être compté).
//
// Les périodes se lisent sur la date de l'OPÉRATION (date du vol, du
// virement — AccountTransaction.date), découpée à minuit heure de Paris,
// comme le relevé PDF et l'historique de la page Comptes pilotes.

const MONEY = '#,##0.00 "€"';
const HOURS = "[h]:mm";
const DATE = "dd/mm/yyyy";

const METHOD_LABEL: Record<string, string> = {
  CARD: "Carte",
  TRANSFER: "Virement",
  CASH: "Espèces",
  CHECK: "Chèque",
};

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Dates (jour à Paris, quel que soit le fuseau du serveur) ----------

function parisOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Minuit à Paris pour un jour "YYYY-MM-DD", en instant absolu (le serveur
// Vercel tourne en UTC : new Date("2026-01-01") tomberait à 1h du matin à
// Paris l'hiver, 2h l'été).
export function parisDayStart(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  return new Date(utcMidnight.getTime() - parisOffsetMinutes(utcMidnight) * 60_000);
}

export function parisToday(): string {
  return new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function parisIso(date: Date): string {
  return date.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Numéro de série Excel d'un jour (vraie date dans le tableur : triable,
// filtrable), sans heure — donc sans aucun décalage de fuseau.
function excelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

// ---------- Cellules ----------

type Cell = XLSX.CellObject | null;
const text = (v: string): Cell => ({ t: "s", v });
const money = (cents: number): Cell => ({ t: "n", v: cents / 100, z: MONEY });
const hours = (h: number): Cell => ({ t: "n", v: h / 24, z: HOURS });
const day = (iso: string): Cell => ({ t: "n", v: excelSerial(iso), z: DATE });
// Formule avec sa valeur déjà calculée : s'affiche juste même dans un
// lecteur qui ne recalcule pas (aperçu de messagerie, visionneuse...).
const formula = (f: string, value: number, z: string): Cell => ({ t: "n", f, v: value, z });

function colName(c: number): string {
  return XLSX.utils.encode_col(c);
}

function buildSheet(rows: Cell[][], widths: number[], autofilter?: { headerRow: number; lastRow: number }) {
  const ws: XLSX.WorkSheet = {};
  let maxCol = 0;
  rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell) return;
      ws[XLSX.utils.encode_cell({ r, c })] = cell;
      maxCol = Math.max(maxCol, c);
    })
  );
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: maxCol } });
  ws["!cols"] = widths.map((wch) => ({ wch }));
  if (autofilter && autofilter.lastRow > autofilter.headerRow) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: autofilter.headerRow, c: 0 },
        e: { r: autofilter.lastRow, c: maxCol },
      }),
    };
  }
  return ws;
}

// ---------- Données ----------

interface ClientRow {
  id: string;
  name: string;
  sortKey: string;
  kind: string;
  openingCents: number;
  depositsCents: number;
  flightsCents: number; // consommé, en positif
  aircraftCents: number;
  instructionCents: number;
  flightHours: number;
  adjustmentsCents: number;
  creditsCents: number;
}

function kindLabel(role: string, isPilot: boolean | undefined): string {
  if (role === "INSTRUCTOR") return "Instructeur";
  if (role === "GERANT") return "Gérant";
  if (role === "ADMIN") return "Administrateur";
  return isPilot ? "Pilote" : "Élève";
}

export async function buildPilotAccountsExport(fromIso: string, toIso: string) {
  const start = parisDayStart(fromIso);
  const end = new Date(parisDayStart(addDays(toIso, 1)).getTime() - 1);

  const [openingSums, transactions, pending] = await Promise.all([
    prisma.accountTransaction.groupBy({
      by: ["studentId"],
      where: { status: "CONFIRMED", date: { lt: start } },
      _sum: { amountCents: true },
    }),
    prisma.accountTransaction.findMany({
      where: { status: "CONFIRMED", date: { gte: start, lte: end } },
      select: {
        studentId: true,
        type: true,
        amountCents: true,
        method: true,
        reference: true,
        notes: true,
        date: true,
        flightLog: {
          select: {
            duration: true,
            aircraftCostCents: true,
            instructionCostCents: true,
            departureAirfield: true,
            arrivalAirfield: true,
            aircraft: { select: { registration: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.accountTransaction.findMany({
      where: { status: "PENDING", type: "DEPOSIT" },
      select: { studentId: true, amountCents: true, method: true, reference: true, notes: true, date: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const opening = new Map(openingSums.map((s) => [s.studentId, s._sum.amountCents ?? 0]));
  const ids = new Set<string>([
    ...openingSums.filter((s) => (s._sum.amountCents ?? 0) !== 0).map((s) => s.studentId),
    ...transactions.map((t) => t.studentId),
    ...pending.map((p) => p.studentId),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, firstName: true, lastName: true, role: true, studentProfile: { select: { isPilot: true } } },
  });

  const clients = new Map<string, ClientRow>();
  for (const u of users) {
    const lastName = u.lastName.trim();
    const firstName = u.firstName.trim();
    clients.set(u.id, {
      id: u.id,
      name: `${lastName.toUpperCase()} ${firstName}`,
      sortKey: `${lastName} ${firstName}`.toLocaleLowerCase("fr"),
      kind: kindLabel(u.role, u.studentProfile?.isPilot),
      openingCents: opening.get(u.id) ?? 0,
      depositsCents: 0,
      flightsCents: 0,
      aircraftCents: 0,
      instructionCents: 0,
      flightHours: 0,
      adjustmentsCents: 0,
      creditsCents: 0,
    });
  }

  // Part avion / part instruction d'un vol débité, toujours déduites du
  // montant RÉELLEMENT débité (qui fait foi) : un débit retiré ou corrigé à
  // la main ne garde pas les coûts d'origine du vol.
  function splitFlight(debitedCents: number, instructionCostCents: number) {
    const instruction = Math.max(0, Math.min(instructionCostCents, debitedCents));
    return { aircraft: debitedCents - instruction, instruction };
  }

  type Movement = { client: ClientRow; iso: string; cells: Cell[] };
  const movements: Movement[] = [];
  for (const t of transactions) {
    const c = clients.get(t.studentId);
    if (!c) continue;
    const iso = parisIso(t.date);
    if (t.type === "DEPOSIT") {
      c.depositsCents += t.amountCents;
      movements.push({
        client: c,
        iso,
        cells: [
          day(iso), text(c.name), text("Versement"), text(t.notes ?? ""), null, null, null, null,
          money(t.amountCents), text(t.method ? METHOD_LABEL[t.method] ?? t.method : ""), text(t.reference ?? ""),
        ],
      });
    } else if (t.type === "FLIGHT_DEBIT") {
      const debited = -t.amountCents;
      const f = t.flightLog;
      const split = splitFlight(debited, f?.instructionCostCents ?? 0);
      c.flightsCents += debited;
      c.aircraftCents += split.aircraft;
      c.instructionCents += split.instruction;
      c.flightHours += f?.duration ?? 0;
      const route = f ? `${f.departureAirfield} → ${f.arrivalAirfield}` : "";
      movements.push({
        client: c,
        iso,
        cells: [
          day(iso), text(c.name), text("Vol"), text(route || (t.notes ?? "")),
          text(f?.aircraft.registration ?? ""), f ? hours(f.duration) : null,
          money(split.aircraft), money(split.instruction), money(t.amountCents), null, null,
        ],
      });
    } else if (t.type === "ADJUSTMENT") {
      c.adjustmentsCents += t.amountCents;
      movements.push({
        client: c,
        iso,
        cells: [day(iso), text(c.name), text("Ajustement"), text(t.notes ?? ""), null, null, null, null, money(t.amountCents), null, null],
      });
    } else if (t.type === "INSTRUCTION_CREDIT") {
      c.creditsCents += t.amountCents;
      movements.push({
        client: c,
        iso,
        cells: [
          day(iso), text(c.name), text("Crédit d'instruction"), text(t.notes ?? ""), null, null, null, null,
          money(t.amountCents), null, null,
        ],
      });
    }
  }

  const rows = [...clients.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey, "fr"));
  const closing = (c: ClientRow) =>
    c.openingCents + c.depositsCents - c.flightsCents + c.adjustmentsCents + c.creditsCents;
  const sum = (pick: (c: ClientRow) => number) => rows.reduce((s, c) => s + pick(c), 0);

  // ---------- Feuille 1 : synthèse par client ----------
  const periodText = `Période du ${frDate(fromIso)} au ${frDate(toIso)}`;
  const summary: Cell[][] = [
    [text("Alpines Flight — Comptes pilotes prépayés : vendu et consommé par client")],
    [text(periodText)],
    [
      text(
        "Montants en euros, tels que crédités/débités sur les comptes pilotes. Seuls les mouvements confirmés sont comptés (versements vérifiés sur le relevé bancaire)."
      ),
    ],
    [],
    [
      text("Client"),
      text("Type"),
      text(`Solde au ${frDate(fromIso)} (début)`),
      text("Vendu : versements"),
      text("Consommé : vols"),
      text("dont location avion"),
      text("dont instruction"),
      text("Heures de vol"),
      text("Ajustements"),
      text("Crédits d'instruction (part FI)"),
      text(`Solde au ${frDate(toIso)} (fin)`),
    ],
  ];
  const headerRow = summary.length - 1; // index 0-based de la ligne d'en-tête
  const firstDataRow = summary.length + 1; // numéro de ligne Excel (1-based)
  for (const c of rows) {
    const r = summary.length + 1;
    summary.push([
      text(c.name),
      text(c.kind),
      money(c.openingCents),
      money(c.depositsCents),
      money(c.flightsCents),
      money(c.aircraftCents),
      money(c.instructionCents),
      hours(c.flightHours),
      money(c.adjustmentsCents),
      money(c.creditsCents),
      formula(`C${r}+D${r}-E${r}+I${r}+J${r}`, closing(c) / 100, MONEY),
    ]);
  }
  const lastDataRow = summary.length;
  const totalCell = (col: number, valueCents: number, z = MONEY) =>
    rows.length
      ? formula(`SUM(${colName(col)}${firstDataRow}:${colName(col)}${lastDataRow})`, z === HOURS ? valueCents / 24 : valueCents / 100, z)
      : z === HOURS
      ? hours(0)
      : money(0);
  summary.push([
    text("TOTAL"),
    text(`${rows.length} compte(s)`),
    totalCell(2, sum((c) => c.openingCents)),
    totalCell(3, sum((c) => c.depositsCents)),
    totalCell(4, sum((c) => c.flightsCents)),
    totalCell(5, sum((c) => c.aircraftCents)),
    totalCell(6, sum((c) => c.instructionCents)),
    totalCell(7, sum((c) => c.flightHours), HOURS),
    totalCell(8, sum((c) => c.adjustmentsCents)),
    totalCell(9, sum((c) => c.creditsCents)),
    totalCell(10, sum((c) => closing(c))),
  ]);
  const totalRowIndex = summary.length - 1;
  const positive = rows.filter((c) => closing(c) > 0);
  const negative = rows.filter((c) => closing(c) < 0);
  const kRange = `K${firstDataRow}:K${lastDataRow}`;
  summary.push([]);
  summary.push([
    text(`Soldes créditeurs au ${frDate(toIso)} : heures prépayées non encore consommées (${positive.length} compte(s))`),
    null, null, null, null, null, null, null, null, null,
    rows.length ? formula(`SUMIF(${kRange},">0")`, positive.reduce((s, c) => s + closing(c), 0) / 100, MONEY) : money(0),
  ]);
  summary.push([
    text(`Soldes débiteurs au ${frDate(toIso)} : montants dus par les pilotes (${negative.length} compte(s))`),
    null, null, null, null, null, null, null, null, null,
    rows.length ? formula(`SUMIF(${kRange},"<0")`, negative.reduce((s, c) => s + closing(c), 0) / 100, MONEY) : money(0),
  ]);
  if (pending.length) {
    summary.push([]);
    summary.push([
      text(
        `${pending.length} versement(s) déclaré(s) par les pilotes en attente de vérification, pour ${(
          pending.reduce((s, p) => s + p.amountCents, 0) / 100
        ).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € — non comptés ici (voir l'onglet « En attente »).`
      ),
    ]);
  }
  const summarySheet = buildSheet(summary, [30, 14, 18, 18, 16, 18, 16, 13, 14, 20, 18], {
    headerRow,
    lastRow: totalRowIndex - 1,
  });

  // ---------- Feuille 2 : détail des mouvements ----------
  movements.sort((a, b) => a.client.sortKey.localeCompare(b.client.sortKey, "fr") || a.iso.localeCompare(b.iso));
  const detail: Cell[][] = [
    [text(`Détail des mouvements confirmés — ${periodText}`)],
    [],
    [
      text("Date"),
      text("Client"),
      text("Type"),
      text("Détail"),
      text("Avion"),
      text("Heures de vol"),
      text("Location avion"),
      text("Instruction"),
      text("Montant (+ crédit / − débit)"),
      text("Moyen de paiement"),
      text("Référence"),
    ],
    ...movements.map((m) => m.cells),
  ];
  const detailSheet = buildSheet(detail, [12, 28, 20, 32, 10, 13, 15, 13, 22, 18, 22], {
    headerRow: 2,
    lastRow: detail.length - 1,
  });

  const wb = XLSX.utils.book_new();
  wb.Props = { Title: "Comptes pilotes — vendu et consommé par client", Author: "Alpines Flight" };
  XLSX.utils.book_append_sheet(wb, summarySheet, "Synthèse par client");
  XLSX.utils.book_append_sheet(wb, detailSheet, "Mouvements");

  // ---------- Feuille 3 : versements en attente (non comptés) ----------
  if (pending.length) {
    const pendingRows: Cell[][] = [
      [text("Versements déclarés par les pilotes, pas encore vérifiés sur le relevé bancaire — non comptés dans les soldes")],
      [],
      [text("Date"), text("Client"), text("Montant"), text("Moyen de paiement"), text("Référence"), text("Notes")],
      ...pending.map((p) => [
        day(parisIso(p.date)),
        text(clients.get(p.studentId)?.name ?? ""),
        money(p.amountCents),
        text(p.method ? METHOD_LABEL[p.method] ?? p.method : ""),
        text(p.reference ?? ""),
        text(p.notes ?? ""),
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, buildSheet(pendingRows, [12, 28, 14, 18, 22, 32]), "En attente");
  }

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });
  return {
    buffer,
    filename: `alpines-flight_comptes-pilotes_${fromIso}_${toIso}.xlsx`,
    totals: {
      clients: rows.length,
      openingCents: sum((c) => c.openingCents),
      depositsCents: sum((c) => c.depositsCents),
      flightsCents: sum((c) => c.flightsCents),
      closingCents: sum((c) => closing(c)),
    },
  };
}
