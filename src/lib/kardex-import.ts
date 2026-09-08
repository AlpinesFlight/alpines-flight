// Import du Kardex papier/Excel existant (interventions + suivi des
// Consignes de Navigabilité) vers l'appli — voir /api/kardex/import/*.
//
// Le classeur réel de l'école (ex. "MAJ KARDEX FBOKF ....xls") a une
// structure stable depuis des années : deux familles de feuilles,
// re-créées à chaque mise à jour physique du Kardex plutôt que des lignes
// ajoutées à une feuille unique :
//  - "KARDEX ..." / "MAJ KARDEX ..." / "MAK KARDEX ..." : par pièce/organe
//    (Cellule, Hélice, Moteur), la dernière application (date + heures
//    cellule), l'intervalle, et la butée (échéance) calculée.
//  - "STATUT ..." / "Statut ..." : le suivi des Consignes de Navigabilité
//    (n° CN/BS, objet, application, intervalle, butée).
//
// Les heures sont stockées par Excel au format personnalisé [h]:mm — un
// NOMBRE DE JOURS (comme une date Excel), pas des heures : il faut le
// multiplier par 24 pour obtenir les heures réelles (vérifié empiriquement
// contre le fichier réel : la butée d'une visite "+50h" tombe exactement
// 50h après l'application une fois ce calcul appliqué).
import * as XLSX from "xlsx";

export interface ParsedMaintenanceRow {
  sourceRow: number;
  // STATUT uniquement (n° de la Consigne de Navigabilité/Bulletin Service).
  cnNumber: string | null;
  label: string;
  // KARDEX : code d'action (RG, PB, REMP...). STATUT : catégorie (A, B...).
  act: string | null;
  appliedDate: string | null; // ISO (YYYY-MM-DD)
  appliedHours: number | null;
  // Peut être un nombre, ou un texte composé (ex. "100/ 500" — calage vs
  // inspection) que l'import ne sait pas convertir automatiquement en
  // échéance : laissé tel quel pour que l'utilisateur tranche à la relecture.
  intervalMonths: number | string | null;
  intervalHours: number | string | null;
  dueDate: string | null;
  dueHours: number | null;
  notes: string | null;
  // Suggestion par défaut pour la case à cocher de l'écran de relecture :
  // une échéance récurrente identifiable (intervalle numérique + butée
  // calculée) est cochée d'office, une ligne "N.C."/déjà classée sans
  // suivi actif ne l'est pas — l'utilisateur reste libre de tout ajuster
  // avant de confirmer, rien n'est jamais importé sans cette relecture.
  suggestedInclude: boolean;
}

export interface ParsedSheet {
  name: string;
  kind: "kardex" | "statut";
  rows: ParsedMaintenanceRow[];
}

function cellAt(sheet: XLSX.WorkSheet, r: number, c: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r, c })];
}

// Convertit un numéro de série de date Excel (ex. 46132) en ISO — passe par
// XLSX.SSF plutôt que de recalculer soi-même (gère la même façon qu'Excel
// le faux 29/02/1900).
function excelSerialToIsoDate(serial: number): string {
  const d = XLSX.SSF.parse_date_code(serial);
  return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
}

// Lit une cellule "durée/date" (colonnes Application/Butée) : le format
// personnalisé ([h]:mm vs m/d/yy) dit comment interpréter le nombre brut —
// voir l'en-tête de ce fichier pour le repère heures = valeur × 24.
function readDateOrHours(sheet: XLSX.WorkSheet, r: number, c: number): { date: string | null; hours: number | null } {
  const cell = cellAt(sheet, r, c);
  if (!cell || typeof cell.v !== "number") return { date: null, hours: null };
  // cell.z est parfois un index numérique vers un format intégré (devise,
  // pourcentage...) plutôt qu'une chaîne — jamais le cas pour [h]:mm/m-d-yy
  // dans ce fichier, qui sont toujours des formats personnalisés (donc des
  // chaînes) : un format numérique ne peut donc être ni l'un ni l'autre ici.
  const fmt = typeof cell.z === "string" ? cell.z : "";
  if (/\[h+\]/i.test(fmt)) {
    return { date: null, hours: Math.round(cell.v * 24 * 100) / 100 };
  }
  if (/[dmy]/i.test(fmt) && fmt !== "General" && fmt !== "0") {
    return { date: excelSerialToIsoDate(cell.v), hours: null };
  }
  return { date: null, hours: null };
}

// Lit une cellule "texte libre" (label, notes, ACT...) quel que soit son
// type de stockage.
function readText(sheet: XLSX.WorkSheet, r: number, c: number): string | null {
  const cell = cellAt(sheet, r, c);
  if (!cell || cell.v === undefined || cell.v === null || cell.v === "") return null;
  return String(cell.v).trim() || null;
}

// Lit une cellule "nombre ou texte composé" (colonnes Intervalle : le plus
// souvent un nombre, parfois un texte comme "100/ 500" — voir
// ParsedMaintenanceRow.intervalHours).
function readNumberOrText(sheet: XLSX.WorkSheet, r: number, c: number): number | string | null {
  const cell = cellAt(sheet, r, c);
  if (!cell || cell.v === undefined || cell.v === "") return null;
  if (typeof cell.v === "number") return cell.v;
  const text = String(cell.v).trim();
  return text || null;
}

function sheetRowRange(sheet: XLSX.WorkSheet): { first: number; last: number } {
  const ref = sheet["!ref"];
  if (!ref) return { first: 0, last: 0 };
  const range = XLSX.utils.decode_range(ref);
  return { first: range.s.r, last: range.e.r };
}

// Repère si la ligne comporte au moins une info exploitable au-delà du
// seul libellé — sinon c'est un séparateur de section ("CELLULE",
// "HELICE", "MOTEUR", "CN AVION"...) ou une ligne vide, à ignorer.
function hasData(row: Omit<ParsedMaintenanceRow, "sourceRow" | "suggestedInclude" | "label" | "cnNumber">): boolean {
  return (
    row.act !== null ||
    row.appliedDate !== null ||
    row.appliedHours !== null ||
    row.intervalMonths !== null ||
    row.intervalHours !== null ||
    row.dueDate !== null ||
    row.dueHours !== null ||
    row.notes !== null
  );
}

// Repère la ligne d'en-tête ("ACT" pour KARDEX, "Objet" pour STATUT, dans
// la colonne indiquée) et renvoie la ligne où commencent les vraies
// données, deux lignes plus bas (l'en-tête lui-même, puis la sous-ligne
// "Date / H Cellule / Mois / H / Date / H Cellule" juste dessous). Sans ce
// repère, le bloc d'identification en haut de feuille (immat, n° de
// série...) et les lignes d'en-tête étaient lus comme si c'étaient des
// interventions — chaque valeur qui traînait dans une colonne du bon type
// suffisait à les faire passer le test hasData().
function findDataStartRow(sheet: XLSX.WorkSheet, last: number, headerCol: number, headerText: string): number {
  for (let r = 0; r <= last; r++) {
    const text = readText(sheet, r, headerCol);
    if (text && text.trim().toUpperCase() === headerText.toUpperCase()) return r + 2;
  }
  // Repère introuvable (feuille à une structure inattendue) : on ne
  // devine pas une position au hasard, mieux vaut ne rien extraire qu'un
  // faux positif sur des données de navigabilité.
  return last + 1;
}

function hasRecurringInterval(row: ParsedMaintenanceRow): boolean {
  const numericInterval =
    (typeof row.intervalMonths === "number" && row.intervalMonths > 0) ||
    (typeof row.intervalHours === "number" && row.intervalHours > 0);
  if (!numericInterval) return false;
  // "SE" (sans effet), "CN ANNULEE"... : explicitement non applicable,
  // même si un intervalle traîne encore dans la ligne.
  const notes = (row.notes ?? "").toUpperCase();
  if (notes.includes("ANNULEE") || notes.includes("N.C.")) return false;
  return true;
}

// Feuille "KARDEX" : colonnes fixes (structure stable depuis 2009 dans le
// fichier réel de l'école) — 0 libellé, 1 ACT, 2 date d'application,
// 3 heures d'application, 4 intervalle (mois), 5 intervalle (heures),
// 6 date de butée, 7 heures de butée, 8 observations.
function parseKardexSheet(sheet: XLSX.WorkSheet, name: string): ParsedSheet {
  const { last } = sheetRowRange(sheet);
  const start = findDataStartRow(sheet, last, 1, "ACT");
  const rows: ParsedMaintenanceRow[] = [];
  for (let r = start; r <= last; r++) {
    const label = readText(sheet, r, 0);
    if (!label) continue;
    const appli = readDateOrHours(sheet, r, 2);
    const butee = readDateOrHours(sheet, r, 6);
    const base = {
      act: readText(sheet, r, 1),
      appliedDate: appli.date,
      appliedHours: readDateOrHours(sheet, r, 3).hours,
      intervalMonths: readNumberOrText(sheet, r, 4),
      intervalHours: readNumberOrText(sheet, r, 5),
      dueDate: butee.date,
      dueHours: readDateOrHours(sheet, r, 7).hours,
      notes: readText(sheet, r, 8),
    };
    if (!hasData(base)) continue; // en-tête de section (CELLULE/HELICE/MOTEUR) ou ligne vide
    const row: ParsedMaintenanceRow = { sourceRow: r + 1, cnNumber: null, label, ...base, suggestedInclude: false };
    row.suggestedInclude = hasRecurringInterval(row);
    rows.push(row);
  }
  return { name, kind: "kardex", rows };
}

// Feuille "STATUT" (Consignes de Navigabilité) : 0 n° CN/BS, 1 objet,
// 2 catégorie, 3 statut, 4 date d'application, 5 heures d'application,
// 6 intervalle (mois), 7 intervalle (heures), 8 date de butée,
// 9 heures de butée, 10 observations.
function parseStatutSheet(sheet: XLSX.WorkSheet, name: string): ParsedSheet {
  const { last } = sheetRowRange(sheet);
  const start = findDataStartRow(sheet, last, 1, "Objet");
  const rows: ParsedMaintenanceRow[] = [];
  for (let r = start; r <= last; r++) {
    const label = readText(sheet, r, 1);
    if (!label) continue;
    const appli = readDateOrHours(sheet, r, 4);
    const butee = readDateOrHours(sheet, r, 8);
    const base = {
      act: readText(sheet, r, 2),
      appliedDate: appli.date,
      appliedHours: readDateOrHours(sheet, r, 5).hours,
      intervalMonths: readNumberOrText(sheet, r, 6),
      intervalHours: readNumberOrText(sheet, r, 7),
      dueDate: butee.date,
      dueHours: readDateOrHours(sheet, r, 9).hours,
      notes: readText(sheet, r, 10),
    };
    if (!hasData(base)) continue; // en-tête de section ("CN AVION"...) ou ligne vide
    const row: ParsedMaintenanceRow = {
      sourceRow: r + 1,
      cnNumber: readText(sheet, r, 0),
      label,
      ...base,
      suggestedInclude: false,
    };
    row.suggestedInclude = hasRecurringInterval(row);
    rows.push(row);
  }
  return { name, kind: "statut", rows };
}

// Repère les feuilles "KARDEX" et "STATUT" par leur nom (insensible à la
// casse, tolère les coquilles vues dans le fichier réel — "MAJ"/"MAK"
// KARDEX) et les parse toutes : l'utilisateur choisit ensuite, côté appli,
// laquelle de chaque famille correspond à la mise à jour la plus récente.
export function parseKardexWorkbook(buffer: Buffer): ParsedSheet[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellNF: true, cellDates: false });
  const sheets: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const upper = name.toUpperCase();
    if (upper.includes("STATUT")) {
      sheets.push(parseStatutSheet(wb.Sheets[name], name));
    } else if (upper.includes("KARDEX")) {
      sheets.push(parseKardexSheet(wb.Sheets[name], name));
    }
  }
  return sheets;
}
