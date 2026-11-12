import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { addDays, parisDayStart, parisIso, parisToday } from "@/lib/paris-time";

// Export Excel des comptes pilotes pour la comptabilité (bilan) : par client,
// ce qui a été encaissé (versements = heures de vol prépayées vendues) et
// consommé (vols débités) sur une période, avec les soldes d'ouverture et de
// clôture — réservé au Gérant (voir /api/transactions/export).
//
// Mise en page pensée pour être lue sans explication (demande du Gérant
// après un premier fichier brut, 2026-11-12) : un récapitulatif chiffré en
// tête, des tableaux titrés et encadrés, des en-têtes en clair, les zéros
// affichés « – », les négatifs en rouge, un détail client par client avec le
// solde après chaque opération (comme un grand livre), et une impression
// prête (A4 paysage, une page de large, numéros de page).
//
// Seuls les mouvements CONFIRMÉS comptent, comme pour les soldes de l'appli
// (un versement déclaré mais pas encore vérifié sur le relevé bancaire est
// listé à part, sans être compté). Les périodes se lisent sur la date de
// l'OPÉRATION (date du vol, du virement — AccountTransaction.date), découpée
// à minuit heure de Paris.

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const METHOD_LABEL: Record<string, string> = {
  CARD: "Carte bancaire",
  TRANSFER: "Virement",
  CASH: "Espèces",
  CHECK: "Chèque",
};

// ---------- Dates (jour à Paris, voir src/lib/paris-time.ts) ----------

export { parisDayStart, parisToday };

function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Jour sans heure, en vraie date Excel (triable, filtrable) : minuit UTC,
// qu'ExcelJS écrit tel quel — donc sans décalage de fuseau.
function excelDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

// ---------- Charte et formats ----------

const C = {
  navy: "FF0C2448",
  navyText: "FF17335A",
  band: "FFE6ECF4",
  zebra: "FFF7F9FC",
  total: "FFEEF2F7",
  border: "FFD5DDE8",
  muted: "FF5F7896",
  green: "FF15803D",
  red: "FFB4141E",
  white: "FFFFFFFF",
};
const FONT = "Calibri";
// Négatifs en rouge, zéro affiché « – » : un tableau sans forêt de 0,00 €.
const MONEY = '#,##0.00 "€";[Red]-#,##0.00 "€";"–"';
// Récapitulatif : le zéro reste écrit (une ligne à « – » y serait ambiguë).
const MONEY_STRICT = '#,##0.00 "€";[Red]-#,##0.00 "€";0.00 "€"';
const HOURS = '[h]"h"mm;-[h]"h"mm;"–"';
const DATE = "dd/mm/yyyy";

const thin = { style: "thin" as const, color: { argb: C.border } };
const medium = { style: "medium" as const, color: { argb: C.navy } };

type Align = "left" | "center" | "right";

function font(cell: ExcelJS.Cell, opts: Partial<ExcelJS.Font> = {}) {
  cell.font = { name: FONT, size: 10, color: { argb: C.navyText }, ...opts };
}

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function setPage(ws: ExcelJS.Worksheet, title: string, printTitlesRow?: string) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 },
    ...(printTitlesRow ? { printTitlesRow } : {}),
  };
  ws.headerFooter = {
    oddHeader: `&L&8&K5F7896Alpines Flight — ${title}`,
    oddFooter: "&R&8&K5F7896Page &P sur &N",
  };
}

// Titre de feuille : nom de l'école, titre, période — sur toute la largeur.
function sheetTitle(ws: ExcelJS.Worksheet, lastCol: number, title: string, subtitle: string) {
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = "ALPINES FLIGHT";
  font(t, { size: 9, bold: true, color: { argb: C.muted } });
  ws.mergeCells(2, 1, 2, lastCol);
  const h = ws.getCell(2, 1);
  h.value = title;
  font(h, { size: 16, bold: true, color: { argb: C.navy } });
  ws.getRow(2).height = 24;
  ws.mergeCells(3, 1, 3, lastCol);
  const s = ws.getCell(3, 1);
  s.value = subtitle;
  font(s, { size: 10, color: { argb: C.muted } });
}

function sectionLabel(ws: ExcelJS.Worksheet, row: number, lastCol: number, label: string) {
  ws.mergeCells(row, 1, row, lastCol);
  const cell = ws.getCell(row, 1);
  cell.value = label.toUpperCase();
  font(cell, { size: 10, bold: true, color: { argb: C.navy } });
  for (let c = 1; c <= lastCol; c++) ws.getCell(row, c).border = { bottom: medium };
  ws.getRow(row).height = 18;
}

function headerRow(ws: ExcelJS.Worksheet, row: number, labels: string[], aligns: Align[]) {
  labels.forEach((label, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = label;
    font(cell, { bold: true, color: { argb: C.white } });
    fill(cell, C.navy);
    cell.alignment = { horizontal: aligns[i] === "left" ? "left" : "center", vertical: "middle", wrapText: true };
    cell.border = { top: thin, bottom: thin, left: thin, right: thin };
  });
  ws.getRow(row).height = 34;
}

function bodyCell(cell: ExcelJS.Cell, align: Align, zebra: boolean, numFmt?: string) {
  font(cell);
  if (numFmt) cell.numFmt = numFmt;
  cell.alignment = { horizontal: align, vertical: "middle" };
  cell.border = { top: thin, bottom: thin, left: thin, right: thin };
  if (zebra) fill(cell, C.zebra);
}

function totalCell(cell: ExcelJS.Cell, align: Align, numFmt?: string) {
  font(cell, { bold: true, color: { argb: C.navy } });
  if (numFmt) cell.numFmt = numFmt;
  cell.alignment = { horizontal: align, vertical: "middle" };
  cell.border = { top: medium, bottom: medium, left: thin, right: thin };
  fill(cell, C.total);
}

function col(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const euros = (cents: number) => cents / 100;
const days = (hours: number) => hours / 24;

// ---------- Données ----------

interface Movement {
  iso: string;
  nature: "Versement" | "Vol" | "Crédit instructeur" | "Correction";
  label: string;
  hours: number | null;
  depositCents: number;
  consumedCents: number;
  creditCents: number;
  correctionCents: number;
}

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
  flightCount: number;
  flightHours: number;
  adjustmentsCents: number;
  creditsCents: number;
  movements: Movement[];
}

function kindLabel(role: string, isPilot: boolean | undefined): string {
  if (role === "INSTRUCTOR") return "Instructeur";
  if (role === "GERANT") return "Gérant";
  if (role === "ADMIN") return "Administrateur";
  return isPilot ? "Pilote" : "Élève";
}

const closingOf = (c: ClientRow) =>
  c.openingCents + c.depositsCents - c.flightsCents + c.adjustmentsCents + c.creditsCents;

async function loadData(fromIso: string, toIso: string) {
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
    const lastName = clean(u.lastName);
    const firstName = clean(u.firstName);
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
      flightCount: 0,
      flightHours: 0,
      adjustmentsCents: 0,
      creditsCents: 0,
      movements: [],
    });
  }

  for (const t of transactions) {
    const c = clients.get(t.studentId);
    if (!c) continue;
    const iso = parisIso(t.date);
    const base = { iso, hours: null, depositCents: 0, consumedCents: 0, creditCents: 0, correctionCents: 0 };
    if (t.type === "DEPOSIT") {
      c.depositsCents += t.amountCents;
      const parts = [t.method ? METHOD_LABEL[t.method] ?? t.method : "Versement"];
      if (t.reference) parts.push(`réf. ${clean(t.reference)}`);
      if (clean(t.notes)) parts.push(clean(t.notes));
      c.movements.push({ ...base, nature: "Versement", label: parts.join(" — "), depositCents: t.amountCents });
    } else if (t.type === "FLIGHT_DEBIT") {
      // Le montant RÉELLEMENT débité fait foi (un débit retiré ou corrigé à
      // la main ne garde pas le coût d'origine du vol) ; la part instruction
      // en est déduite, plafonnée au débit.
      const debited = -t.amountCents;
      const f = t.flightLog;
      const instruction = Math.max(0, Math.min(f?.instructionCostCents ?? 0, debited));
      c.flightsCents += debited;
      c.instructionCents += instruction;
      c.aircraftCents += debited - instruction;
      c.flightCount += 1;
      c.flightHours += f?.duration ?? 0;
      const label = f
        ? `${f.aircraft.registration} · ${f.departureAirfield} → ${f.arrivalAirfield}${
            instruction > 0 ? " · avec instruction" : ""
          }${debited === 0 ? " · non facturé" : ""}`
        : clean(t.notes);
      c.movements.push({ ...base, nature: "Vol", label, hours: f?.duration ?? null, consumedCents: debited });
    } else if (t.type === "ADJUSTMENT") {
      c.adjustmentsCents += t.amountCents;
      c.movements.push({ ...base, nature: "Correction", label: clean(t.notes), correctionCents: t.amountCents });
    } else if (t.type === "INSTRUCTION_CREDIT") {
      c.creditsCents += t.amountCents;
      c.movements.push({ ...base, nature: "Crédit instructeur", label: clean(t.notes), creditCents: t.amountCents });
    }
  }

  const rows = [...clients.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey, "fr"));
  const pendingRows = pending.map((p) => ({
    iso: parisIso(p.date),
    name: clients.get(p.studentId)?.name ?? "",
    amountCents: p.amountCents,
    method: p.method ? METHOD_LABEL[p.method] ?? p.method : "",
    reference: clean(p.reference),
    notes: clean(p.notes),
  }));
  return { rows, pendingRows };
}

// ---------- Classeur ----------

export async function buildPilotAccountsExport(fromIso: string, toIso: string) {
  const { rows, pendingRows } = await loadData(fromIso, toIso);
  const sum = (pick: (c: ClientRow) => number) => rows.reduce((s, c) => s + pick(c), 0);
  const hasCredits = rows.some((c) => c.creditsCents !== 0);
  const hasCorrections = rows.some((c) => c.adjustmentsCents !== 0);
  const period = `Période du ${frDate(fromIso)} au ${frDate(toIso)}`;
  const edited = `édité le ${frDate(parisToday())}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Alpines Flight";
  wb.created = new Date();
  wb.title = `Comptes pilotes prépayés — ${period}`;

  // ===== Feuille 1 : Synthèse =====
  const syn = wb.addWorksheet("Synthèse", {
    properties: { tabColor: { argb: C.navy } },
    views: [{ showGridLines: false }],
  });
  const synCols: { label: string; width: number; align: Align; fmt?: string; value: (c: ClientRow) => number | string }[] = [
    { label: "Client", width: 30, align: "left", value: (c) => c.name },
    { label: "Statut", width: 13, align: "left", value: (c) => c.kind },
    { label: `Solde d'ouverture\nau ${frDate(fromIso)}`, width: 17, align: "right", fmt: MONEY, value: (c) => euros(c.openingCents) },
    { label: "Encaissé\n(heures prépayées vendues)", width: 19, align: "right", fmt: MONEY, value: (c) => euros(c.depositsCents) },
    { label: "Consommé\n(vols effectués)", width: 17, align: "right", fmt: MONEY, value: (c) => euros(c.flightsCents) },
    ...(hasCredits
      ? [{ label: "Crédits\ninstructeurs", width: 15, align: "right" as Align, fmt: MONEY, value: (c: ClientRow) => euros(c.creditsCents) }]
      : []),
    ...(hasCorrections
      ? [{ label: "Corrections\nmanuelles", width: 14, align: "right" as Align, fmt: MONEY, value: (c: ClientRow) => euros(c.adjustmentsCents) }]
      : []),
    { label: `Solde de clôture\nau ${frDate(toIso)}`, width: 17, align: "right", fmt: MONEY, value: (c) => euros(closingOf(c)) },
    { label: "Situation", width: 30, align: "left", value: () => "" },
  ];
  const nSyn = synCols.length;
  const colOf = (labelStart: string) => synCols.findIndex((x) => x.label.startsWith(labelStart)) + 1;
  const cOpen = colOf("Solde d'ouverture");
  const cDep = colOf("Encaissé");
  const cCons = colOf("Consommé");
  const cCred = hasCredits ? colOf("Crédits") : 0;
  const cCorr = hasCorrections ? colOf("Corrections") : 0;
  const cClose = colOf("Solde de clôture");
  const cSit = nSyn;
  synCols.forEach((x, i) => (syn.getColumn(i + 1).width = x.width));
  sheetTitle(syn, nSyn, "Comptes pilotes prépayés — situation par client", `${period} · ${edited}`);

  // Positions : récapitulatif (titre en ligne 5, puis ses N lignes), une
  // ligne vide, puis le tableau par client. N = 9 lignes fixes (ouverture,
  // encaissé, consommé et ses 3 détails, clôture et ses 2 détails) + les
  // lignes optionnelles.
  const recapStart = 5;
  const recapLines = 9 + (hasCredits ? 1 : 0) + (hasCorrections ? 1 : 0);
  const tableLabelRow = recapStart + recapLines + 2;
  const tableHeaderRow = tableLabelRow + 1;
  const firstData = tableHeaderRow + 1;
  const lastData = firstData + rows.length - 1;
  const totalRow = rows.length ? lastData + 1 : firstData;
  const range = (c: number) => `${col(c)}${firstData}:${col(c)}${lastData}`;
  const ref = (c: number) => `${col(c)}${totalRow}`;

  // --- Récapitulatif ---
  sectionLabel(syn, recapStart, nSyn, "Récapitulatif");
  const positives = rows.filter((c) => closingOf(c) > 0);
  const negatives = rows.filter((c) => closingOf(c) < 0);
  type RecapLine = { label: string; value: ExcelJS.CellValue; fmt: string; style?: "main" | "sub" | "total"; color?: string };
  const recap: RecapLine[] = [
    { label: `Solde d'ouverture au ${frDate(fromIso)}`, value: { formula: ref(cOpen), result: euros(sum((c) => c.openingCents)) }, fmt: MONEY_STRICT, style: "main" },
    { label: "+ Encaissé sur la période (heures de vol prépayées vendues)", value: { formula: ref(cDep), result: euros(sum((c) => c.depositsCents)) }, fmt: MONEY_STRICT, style: "main" },
    { label: "− Consommé sur la période (vols effectués)", value: { formula: ref(cCons), result: euros(sum((c) => c.flightsCents)) }, fmt: MONEY_STRICT, style: "main" },
    { label: "dont location avion", value: euros(sum((c) => c.aircraftCents)), fmt: MONEY_STRICT, style: "sub" },
    { label: "dont instruction", value: euros(sum((c) => c.instructionCents)), fmt: MONEY_STRICT, style: "sub" },
    { label: `soit ${sum((c) => c.flightCount)} vol(s) pour un total d'heures de vol de`, value: days(sum((c) => c.flightHours)), fmt: HOURS, style: "sub" },
    ...(hasCredits
      ? [{ label: "+ Crédits accordés aux instructeurs (part d'instruction payée en heures de vol)", value: { formula: ref(cCred), result: euros(sum((c) => c.creditsCents)) }, fmt: MONEY_STRICT, style: "main" as const }]
      : []),
    ...(hasCorrections
      ? [{ label: "+/− Corrections manuelles", value: { formula: ref(cCorr), result: euros(sum((c) => c.adjustmentsCents)) }, fmt: MONEY_STRICT, style: "main" as const }]
      : []),
    { label: `= Solde de clôture au ${frDate(toIso)}`, value: { formula: ref(cClose), result: euros(sum((c) => closingOf(c))) }, fmt: MONEY_STRICT, style: "total" },
    {
      label: `dont avances des clients : heures prépayées non encore consommées (${positives.length} compte${positives.length > 1 ? "s" : ""})`,
      value: rows.length ? { formula: `SUMIF(${range(cClose)},">0")`, result: euros(positives.reduce((s, c) => s + closingOf(c), 0)) } : 0,
      fmt: MONEY_STRICT,
      style: "sub",
      color: C.green,
    },
    {
      label: `dont sommes dues par les clients : vols non encore réglés (${negatives.length} compte${negatives.length > 1 ? "s" : ""})`,
      value: rows.length ? { formula: `SUMIF(${range(cClose)},"<0")`, result: euros(negatives.reduce((s, c) => s + closingOf(c), 0)) } : 0,
      fmt: MONEY_STRICT,
      style: "sub",
      color: C.red,
    },
  ];
  // Libellé sur les colonnes A à (avant-dernière colonne chiffrée), montant
  // dans la colonne du solde de clôture : lu comme un petit compte de résultat.
  recap.forEach((line, i) => {
    const r = recapStart + 1 + i;
    syn.mergeCells(r, 1, r, cClose - 1);
    const label = syn.getCell(r, 1);
    label.value = line.style === "sub" ? `      ${line.label}` : line.label;
    font(label, {
      bold: line.style !== "sub",
      italic: line.style === "sub",
      color: { argb: line.style === "sub" ? C.muted : C.navyText },
    });
    label.alignment = { vertical: "middle" };
    const value = syn.getCell(r, cClose);
    value.value = line.value;
    value.numFmt = line.fmt;
    font(value, {
      bold: line.style !== "sub",
      italic: line.style === "sub",
      color: { argb: line.color ?? (line.style === "sub" ? C.muted : C.navyText) },
    });
    value.alignment = { horizontal: "right", vertical: "middle" };
    if (line.style === "total") {
      for (let c = 1; c <= cClose; c++) {
        const cell = syn.getCell(r, c);
        cell.border = { top: medium, bottom: medium };
        fill(cell, C.total);
      }
      font(label, { bold: true, color: { argb: C.navy } });
      font(value, { bold: true, color: { argb: C.navy } });
      syn.getRow(r).height = 18;
    }
  });

  // --- Tableau par client ---
  sectionLabel(syn, tableLabelRow, nSyn, "Situation par client");
  headerRow(syn, tableHeaderRow, synCols.map((x) => x.label), synCols.map((x) => x.align));
  rows.forEach((c, i) => {
    const r = firstData + i;
    const zebra = i % 2 === 1;
    synCols.forEach((x, j) => {
      const cell = syn.getCell(r, j + 1);
      if (j + 1 === cClose) {
        const parts = [`${col(cOpen)}${r}`, `+${col(cDep)}${r}`, `-${col(cCons)}${r}`];
        if (cCred) parts.push(`+${col(cCred)}${r}`);
        if (cCorr) parts.push(`+${col(cCorr)}${r}`);
        cell.value = { formula: parts.join(""), result: euros(closingOf(c)) };
      } else if (j + 1 === cSit) {
        const closing = closingOf(c);
        cell.value =
          closing > 0 ? "Avance du client (prépayé restant)" : closing < 0 ? "Doit cette somme à l'école" : "Soldé";
      } else {
        cell.value = x.value(c);
      }
      bodyCell(cell, x.align, zebra, x.fmt);
      if (j + 1 === cClose) font(cell, { bold: true });
      if (j + 1 === cSit) {
        const closing = closingOf(c);
        font(cell, { color: { argb: closing > 0 ? C.green : closing < 0 ? C.red : C.muted } });
      }
    });
    syn.getRow(r).height = 16;
  });
  synCols.forEach((x, j) => {
    const cell = syn.getCell(totalRow, j + 1);
    if (j === 0) cell.value = "TOTAL";
    else if (j === 1) cell.value = `${rows.length} compte${rows.length > 1 ? "s" : ""}`;
    else if (j + 1 === cSit) cell.value = "";
    else if (x.fmt && rows.length) {
      const result =
        j + 1 === cClose ? euros(sum(closingOf)) : sum((c) => Number(x.value(c)) * 100) / 100;
      cell.value = { formula: `SUM(${range(j + 1)})`, result };
    } else if (x.fmt) cell.value = 0;
    totalCell(cell, x.align, x.fmt);
  });
  syn.getRow(totalRow).height = 18;

  // --- Notes ---
  const notes = [
    "Encaissé : versements des pilotes, comptés à la date du virement une fois vérifiés sur le relevé bancaire.",
    "Consommé : vols effectués et débités sur le compte du pilote, à la date du vol (location de l'avion + instruction).",
    ...(hasCredits
      ? ["Crédits instructeurs : part de l'instruction créditée sur le compte pilote des instructeurs, utilisable en heures de vol."]
      : []),
    "Solde positif : avance du client (heures prépayées non consommées). Solde négatif : somme due par le client à l'école.",
    pendingRows.length
      ? `${pendingRows.length} versement(s) déclaré(s) par les pilotes mais pas encore vérifié(s) ne sont pas comptés ici : voir l'onglet « À vérifier ».`
      : "Tous les versements déclarés par les pilotes ont été vérifiés : aucun n'est en attente.",
  ];
  const notesRow = totalRow + 2;
  sectionLabel(syn, notesRow, nSyn, "Notes");
  notes.forEach((n, i) => {
    const r = notesRow + 1 + i;
    syn.mergeCells(r, 1, r, nSyn);
    const cell = syn.getCell(r, 1);
    cell.value = `${i + 1}. ${n}`;
    font(cell, { size: 9, color: { argb: C.muted } });
  });
  setPage(syn, "Comptes pilotes prépayés");

  // ===== Feuille 2 : Détail par client (grand livre) =====
  const det = wb.addWorksheet("Détail par client", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const detCols: { label: string; width: number; align: Align; fmt?: string }[] = [
    { label: "Date", width: 11, align: "center", fmt: DATE },
    { label: "Opération", width: 17, align: "left" },
    { label: "Libellé", width: 46, align: "left" },
    { label: "Heures\nde vol", width: 9, align: "center", fmt: HOURS },
    { label: "Encaissé", width: 14, align: "right", fmt: MONEY },
    { label: "Consommé", width: 14, align: "right", fmt: MONEY },
    ...(hasCredits ? [{ label: "Crédit\ninstructeur", width: 13, align: "right" as Align, fmt: MONEY }] : []),
    ...(hasCorrections ? [{ label: "Correction", width: 13, align: "right" as Align, fmt: MONEY }] : []),
    { label: "Solde après\nopération", width: 15, align: "right", fmt: MONEY_STRICT },
  ];
  const nDet = detCols.length;
  detCols.forEach((x, i) => (det.getColumn(i + 1).width = x.width));
  sheetTitle(det, nDet, "Détail des opérations par client", `${period} · solde du compte après chaque opération`);
  // Ligne 4 = en-tête (figé à l'écran et répété à l'impression).
  headerRow(det, 4, detCols.map((x) => x.label), detCols.map((x) => x.align));
  const dHours = 4;
  const dDep = 5;
  const dCons = 6;
  const dCred = hasCredits ? 7 : 0;
  const dCorr = hasCorrections ? (hasCredits ? 8 : 7) : 0;
  const dBal = nDet;
  let r = 5;
  for (const c of rows) {
    // Bandeau client
    det.mergeCells(r, 1, r, nDet);
    const band = det.getCell(r, 1);
    band.value = `${c.name} — ${c.kind}`;
    font(band, { size: 11, bold: true, color: { argb: C.navy } });
    for (let k = 1; k <= nDet; k++) fill(det.getCell(r, k), C.band);
    det.getRow(r).height = 20;
    r++;
    // Solde d'ouverture
    det.mergeCells(r, 1, r, nDet - 1);
    const open = det.getCell(r, 1);
    open.value = `Solde d'ouverture au ${frDate(fromIso)}`;
    font(open, { italic: true, color: { argb: C.muted } });
    const openVal = det.getCell(r, dBal);
    openVal.value = euros(c.openingCents);
    bodyCell(openVal, "right", false, MONEY_STRICT);
    font(openVal, { italic: true, color: { argb: C.muted } });
    r++;
    let balance = c.openingCents;
    const first = r;
    c.movements.forEach((m, i) => {
      balance += m.depositCents - m.consumedCents + m.creditCents + m.correctionCents;
      const zebra = i % 2 === 1;
      const values: Record<number, ExcelJS.CellValue> = {
        1: excelDay(m.iso),
        2: m.nature,
        3: m.label,
        [dHours]: m.hours != null ? days(m.hours) : null,
        [dDep]: m.depositCents ? euros(m.depositCents) : null,
        [dCons]: m.nature === "Vol" ? euros(m.consumedCents) : null,
        ...(dCred ? { [dCred]: m.creditCents ? euros(m.creditCents) : null } : {}),
        ...(dCorr ? { [dCorr]: m.correctionCents ? euros(m.correctionCents) : null } : {}),
        [dBal]: euros(balance),
      };
      detCols.forEach((x, j) => {
        const cell = det.getCell(r, j + 1);
        cell.value = values[j + 1] ?? null;
        bodyCell(cell, x.align, zebra, x.fmt);
      });
      r++;
    });
    if (c.movements.length === 0) {
      det.mergeCells(r, 1, r, nDet - 1);
      const none = det.getCell(r, 1);
      none.value = "Aucune opération sur la période";
      font(none, { italic: true, color: { argb: C.muted } });
      r++;
    }
    const last = r - 1;
    // Total du client
    det.mergeCells(r, 1, r, 3);
    detCols.forEach((x, j) => {
      const k = j + 1;
      const cell = det.getCell(r, k);
      if (k === 1) cell.value = `Total ${c.name}`;
      else if (k > 3 && k < dBal && c.movements.length) {
        const result =
          k === dHours ? days(c.flightHours)
          : k === dDep ? euros(c.depositsCents)
          : k === dCons ? euros(c.flightsCents)
          : k === dCred ? euros(c.creditsCents)
          : euros(c.adjustmentsCents);
        cell.value = { formula: `SUM(${col(k)}${first}:${col(k)}${last})`, result };
      } else if (k === dBal) {
        cell.value = euros(closingOf(c));
      }
      totalCell(cell, k <= 3 ? "left" : x.align, k <= 3 ? undefined : x.fmt);
    });
    det.getRow(r).height = 18;
    r += 2;
  }
  setPage(det, "Détail des opérations par client", "4:4");

  // ===== Feuille 3 : Consommation =====
  const cons = wb.addWorksheet("Consommation", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const consCols: { label: string; width: number; align: Align; fmt?: string; value: (c: ClientRow) => number | string }[] = [
    { label: "Client", width: 30, align: "left", value: (c) => c.name },
    { label: "Statut", width: 13, align: "left", value: (c) => c.kind },
    { label: "Nombre\nde vols", width: 10, align: "center", fmt: "0", value: (c) => c.flightCount },
    { label: "Heures\nde vol", width: 11, align: "center", fmt: HOURS, value: (c) => days(c.flightHours) },
    { label: "Location\navion", width: 16, align: "right", fmt: MONEY, value: (c) => euros(c.aircraftCents) },
    { label: "Instruction", width: 15, align: "right", fmt: MONEY, value: (c) => euros(c.instructionCents) },
    { label: "Total\nconsommé", width: 16, align: "right", fmt: MONEY, value: (c) => euros(c.flightsCents) },
  ];
  consCols.forEach((x, i) => (cons.getColumn(i + 1).width = x.width));
  sheetTitle(cons, consCols.length, "Consommation par client", `${period} · vols débités sur les comptes pilotes`);
  headerRow(cons, 4, consCols.map((x) => x.label), consCols.map((x) => x.align));
  const consumers = rows.filter((c) => c.flightCount > 0);
  consumers.forEach((c, i) => {
    consCols.forEach((x, j) => {
      const cell = cons.getCell(5 + i, j + 1);
      cell.value = x.value(c);
      bodyCell(cell, x.align, i % 2 === 1, x.fmt);
    });
  });
  const consTotal = 5 + consumers.length;
  consCols.forEach((x, j) => {
    const cell = cons.getCell(consTotal, j + 1);
    if (j === 0) cell.value = "TOTAL";
    else if (j === 1) cell.value = "";
    else if (consumers.length) {
      const result = consumers.reduce((s, c) => s + Number(x.value(c)), 0);
      cell.value = { formula: `SUM(${col(j + 1)}5:${col(j + 1)}${consTotal - 1})`, result };
    } else cell.value = 0;
    totalCell(cell, x.align, x.fmt);
  });
  setPage(cons, "Consommation par client", "4:4");

  // ===== Feuille 4 : À vérifier (versements en attente, non comptés) =====
  if (pendingRows.length) {
    const pen = wb.addWorksheet("À vérifier", {
      properties: { tabColor: { argb: "FFF04818" } },
      views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    });
    const penCols: { label: string; width: number; align: Align; fmt?: string }[] = [
      { label: "Date", width: 11, align: "center", fmt: DATE },
      { label: "Client", width: 30, align: "left" },
      { label: "Montant", width: 14, align: "right", fmt: MONEY },
      { label: "Moyen de paiement", width: 18, align: "left" },
      { label: "Référence", width: 22, align: "left" },
      { label: "Note du pilote", width: 34, align: "left" },
    ];
    penCols.forEach((x, i) => (pen.getColumn(i + 1).width = x.width));
    sheetTitle(
      pen,
      penCols.length,
      "Versements déclarés, en attente de vérification",
      "Non comptés dans les soldes tant qu'ils ne sont pas vérifiés sur le relevé bancaire"
    );
    headerRow(pen, 4, penCols.map((x) => x.label), penCols.map((x) => x.align));
    pendingRows.forEach((p, i) => {
      const values: ExcelJS.CellValue[] = [excelDay(p.iso), p.name, euros(p.amountCents), p.method, p.reference, p.notes];
      penCols.forEach((x, j) => {
        const cell = pen.getCell(5 + i, j + 1);
        cell.value = values[j];
        bodyCell(cell, x.align, i % 2 === 1, x.fmt);
      });
    });
    const penTotal = 5 + pendingRows.length;
    penCols.forEach((x, j) => {
      const cell = pen.getCell(penTotal, j + 1);
      if (j === 0) cell.value = "TOTAL";
      else if (j === 2)
        cell.value = {
          formula: `SUM(C5:C${penTotal - 1})`,
          result: euros(pendingRows.reduce((s, p) => s + p.amountCents, 0)),
        };
      else cell.value = "";
      totalCell(cell, x.align, x.fmt);
    });
    setPage(pen, "Versements à vérifier", "4:4");
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    buffer,
    filename: `Alpines-Flight_comptes-pilotes-prepayes_${fromIso}_au_${toIso}.xlsx`,
    totals: {
      clients: rows.length,
      openingCents: sum((c) => c.openingCents),
      depositsCents: sum((c) => c.depositsCents),
      flightsCents: sum((c) => c.flightsCents),
      closingCents: sum((c) => closingOf(c)),
    },
  };
}
