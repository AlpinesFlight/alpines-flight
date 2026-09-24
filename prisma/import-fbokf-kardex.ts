// Import ponctuel du Kardex réel F-BOKF (source : "MAJ KARDEX FBOKF
// 20.04.2026.xls", onglets "MAJ KARDEX 20 AVRIL 2026" + "STATUT 20 AVRIL
// 2026"). Valeurs décodées à la main depuis les cellules brutes (xlrd,
// formatting_info=True) car Excel stocke les heures au format [h]:mm comme
// des "dates" 1900+N jours — voir le calcul heures = valeur_brute × 24,
// vérifié en recoupant plusieurs cellules dont la somme application+
// intervalle=butée tombe juste. Script à usage unique, non ré-exécutable
// (throw si les échéances F-BOKF existent déjà) — supprimé après usage.
import { prisma } from "../src/lib/prisma";

const AIRCRAFT_REGISTRATION = "F-BOKF";

// H.T. Cellule au 20/04/2026 (Kardex, cellule "H.T. Cellule") : 310.2548611111111 × 24
const CELLULE_HOURS_AT_SNAPSHOT = 310.2548611111111 * 24; // 7446.116666666667

async function main() {
  const aircraft = await prisma.aircraft.findFirstOrThrow({ where: { registration: AIRCRAFT_REGISTRATION } });
  const gerant = await prisma.user.findFirstOrThrow({ where: { role: "GERANT" } });

  const existingCount = await prisma.maintenanceRecord.count({ where: { aircraftId: aircraft.id } });
  if (existingCount > 0) {
    throw new Error(`${AIRCRAFT_REGISTRATION} a déjà ${existingCount} échéance(s) — script à usage unique, abandon.`);
  }

  // ---- 1) Réconciliation des heures cellule ----
  // totalHours actuel = heures volées via l'app depuis l'ajout de l'avion
  // (confirmé par l'utilisateur) ; on l'ADDITIONNE à la base réelle du
  // Kardex (pas un remplacement, pour ne pas perdre les vols déjà saisis).
  const appTrackedHours = aircraft.totalHours;
  const newTotalHours = CELLULE_HOURS_AT_SNAPSHOT + appTrackedHours;

  console.log(`Heures cellule : Kardex(20/04/2026)=${CELLULE_HOURS_AT_SNAPSHOT.toFixed(3)}h + app=${appTrackedHours.toFixed(3)}h = ${newTotalHours.toFixed(3)}h`);

  await prisma.aircraft.update({
    where: { id: aircraft.id },
    data: { totalHours: newTotalHours },
  });

  // ---- 2) Échéances vivantes (MaintenanceRecord), en heures CELLULE ----
  // Chaque dueAtHours ci-dessous = valeur "Butée H Cellule" du Kardex/Statut
  // (déjà en cellule, pas de conversion moteur nécessaire), reprise telle
  // quelle — elle reste correcte après réconciliation, seul le total avion
  // change, pas les seuils absolus.
  type NewRecord = {
    label: string;
    reference?: string;
    zone: string;
    type: "HOURLY" | "CALENDAR" | "CYCLES";
    dueAtHours?: number;
    dueAtDate?: string;
    alertBefore: number;
    intervalHours?: number;
    intervalDays?: number;
    notes?: string;
  };

  const records: NewRecord[] = [
    // --- CELLULE ---
    { label: "VP1 / 50H", zone: "Cellule", type: "HOURLY", dueAtHours: 7496.116666666667, alertBefore: 10, intervalHours: 50 },
    { label: "VP2 / 100H + VA", zone: "Cellule", type: "HOURLY", dueAtHours: 7546.116666666667, dueAtDate: "2027-04-20", alertBefore: 10, intervalHours: 100, intervalDays: 365 },
    { label: "GV (grande visite)", reference: "BS36", zone: "Cellule", type: "HOURLY", dueAtHours: 9446.116666666667, dueAtDate: "2032-04-20", alertBefore: 30, intervalHours: 2000, intervalDays: 2191, notes: "Dernière GV : 2000h/6ans (voir Kardex)." },
    { label: "Examen de navigabilité (ARC)", zone: "Cellule", type: "CALENDAR", dueAtDate: "2026-03-10", alertBefore: 30, intervalDays: 365, notes: "⚠️ Butée antérieure à aujourd'hui d'après le Kardex du 20/04/2026 — a probablement été renouvelé depuis, à vérifier et corriger la date si besoin." },
    { label: "Tuyauteries essence", zone: "Cellule", type: "CALENDAR", dueAtDate: "2028-09-30", alertBefore: 60, intervalDays: 2191 },
    { label: "Tuyauteries freins", zone: "Cellule", type: "CALENDAR", dueAtDate: "2037-06-18", alertBefore: 60, intervalDays: 3652 },

    // --- MOTEUR (seuils exprimés en heures cellule, cohérents avec les
    // autres, car directement lus tels quels depuis la colonne "Butée H
    // Cellule" du Kardex — contrairement aux 3 CN moteur ci-dessous) ---
    { label: "Potentiel moteur (RG à 2160h / TBO)", zone: "Moteur", type: "HOURLY", dueAtHours: 7759.166666666667, dueAtDate: "2027-04-17", alertBefore: 20, intervalHours: 2160, intervalDays: 365, notes: "Cf. PE MIP AMC MLA302(d) du 13/03/2020 — programme \"on condition\"." },
    { label: "Potentiel calendaire moteur (anti-corrosion)", zone: "Moteur", type: "CALENDAR", dueAtDate: "2027-06-28", alertBefore: 30, intervalDays: 1096, notes: "RG le 01/04/1988." },
    { label: "Magnéto gauche — inspection 500h", reference: "MAG G S4LN21 A138331XF", zone: "Moteur", type: "HOURLY", dueAtHours: 7798.5, alertBefore: 15, intervalHours: 500, notes: "Calage à recontrôler tous les 100h (non suivi séparément ici) — RG le 07/03/2017." },
    { label: "Magnéto droite — inspection 500h", reference: "MAG D S4LN21 A5083XF", zone: "Moteur", type: "HOURLY", dueAtHours: 7798.5, alertBefore: 15, intervalHours: 500, notes: "Calage à recontrôler tous les 100h (non suivi séparément ici) — RG le 07/03/2017." },

    // --- CN/AD récurrentes en heures CELLULE (Cat A = cellule, Cat E =
    // équipement mais référencées en heures cellule dans le Statut) ---
    { label: "Cloison arrière de fuselage", reference: "1992-224 (A) R2", zone: "Cellule", type: "HOURLY", dueAtHours: 7546.116666666667, dueAtDate: "2027-04-17", alertBefore: 10, intervalHours: 100, intervalDays: 365 },
    { label: "Boîtier d'admission d'air", reference: "EU 2014-0155 (A)", zone: "Cellule", type: "HOURLY", dueAtHours: 7546.116666666667, dueAtDate: "2027-04-17", alertBefore: 10, intervalHours: 100, intervalDays: 365 },
    { label: "Interrupteur", reference: "1977-168-IMP (AB)", zone: "Équipement", type: "HOURLY", dueAtHours: 7530, dueAtDate: "2027-04-17", alertBefore: 10, intervalHours: 100, notes: "Butée reprise telle quelle depuis le Statut (léger écart avec App.H+intervalle, probablement un point d'application antérieur non détaillé dans l'extrait — non recalculée)." },
    { label: "Carburateur — inspection du venturi", reference: "1998-115-IMP (A)", zone: "Équipement", type: "CALENDAR", dueAtDate: "2027-04-17", alertBefore: 15, intervalDays: 365 },
    { label: "Allumage — inspection système automatique d'avance", reference: "N-2005-12-06 (A)", zone: "Équipement", type: "HOURLY", dueAtHours: 7798.5, dueAtDate: "2029-03-07", alertBefore: 15, intervalHours: 500, intervalDays: 4380, notes: "Lié à l'inspection 500h des magnétos (même échéance)." },
  ];

  for (const r of records) {
    await prisma.maintenanceRecord.create({
      data: {
        aircraftId: aircraft.id,
        label: r.label,
        reference: r.reference ?? null,
        zone: r.zone,
        type: r.type,
        dueAtHours: r.dueAtHours ?? null,
        dueAtDate: r.dueAtDate ? new Date(r.dueAtDate) : null,
        alertBefore: r.alertBefore,
        intervalHours: r.intervalHours ?? null,
        intervalDays: r.intervalDays ?? null,
        notes: r.notes ?? null,
      },
    });
  }
  console.log(`${records.length} échéances créées.`);

  // ---- 3) CN moteur (heures moteur, PAS suivies en direct — pas de
  // compteur moteur dédié dans l'app aujourd'hui) : consignées en Kardex
  // avec la valeur brute, pour ne pas afficher un potentiel calculé qui
  // pourrait être faux si le moteur est un jour remplacé/échangé. ----
  const engineOnlyCn: { label: string; reference: string; engineHoursApp: number; engineHoursDue: number }[] = [
    { label: "Criques culasses", reference: "1975-215-IMP (A)", engineHoursApp: 5446.366666666667, engineHoursDue: 5480 },
    { label: "Filtre pompe à carburant", reference: "1981-092-IMP (AB)", engineHoursApp: 5446.366666666667, engineHoursDue: 5446.366666666667 },
    { label: "Throttle and mixture control arms", reference: "SB08-3", engineHoursApp: 5446.366666666667, engineHoursDue: 5530 },
  ];
  for (const cn of engineOnlyCn) {
    await prisma.kardexEntry.create({
      data: {
        aircraftId: aircraft.id,
        date: new Date("2026-04-17"),
        hoursAt: newTotalHours,
        category: "CONSIGNE_NAVIGABILITE",
        title: cn.label,
        reference: cn.reference,
        description: `Suivi en heures moteur (non recalculé automatiquement) : dernière application à ${cn.engineHoursApp.toFixed(1)}h moteur, prochaine échéance à ${cn.engineHoursDue.toFixed(1)}h moteur. Pas de compteur moteur dédié dans l'app — à surveiller manuellement ou ajouter un compteur moteur si besoin.`,
        createdById: gerant.id,
      },
    });
  }
  console.log(`${engineOnlyCn.length} CN moteur consignées en Kardex (non suivies en direct).`);

  // ---- 4) Historique "sans échéance" / condition-based → Kardex uniquement ----
  const historyOnly: { label: string; category: "REPARATION" | "AUTRE" | "PIECE_REMPLACEE"; reference?: string; date: string; notes?: string }[] = [
    { label: "Pesée", category: "AUTRE", date: "2017-04-17" },
    { label: "Compensation compas", category: "AUTRE", date: "2014-04-27", notes: "Sans échéance fixe." },
    { label: "Instruments de bord (Alti/Vario/Badin)", category: "AUTRE", date: "2014-02-27", notes: "Plombé (PB), sans échéance fixe." },
    { label: "Hélice EVRA D11-28-7C", reference: "S/N 832ST", category: "REPARATION", date: "2011-04-14", notes: "Révision générale — suivi \"selon état\", sans échéance fixe." },
    { label: "Carburateur MA3SPS", reference: "S/N BE22-15585", category: "PIECE_REMPLACEE", date: "2026-04-17", notes: "Révision générale, sans échéance fixe reprogrammée." },
    { label: "Générateur DELCO 1101890", reference: "S/N 53678", category: "PIECE_REMPLACEE", date: "2026-04-17", notes: "Révision générale, sans échéance fixe reprogrammée." },
    { label: "Batterie", category: "PIECE_REMPLACEE", date: "2026-04-17", notes: "Remplacement sur état, sans échéance fixe." },
  ];
  for (const h of historyOnly) {
    await prisma.kardexEntry.create({
      data: {
        aircraftId: aircraft.id,
        date: new Date(h.date),
        hoursAt: newTotalHours,
        category: h.category,
        title: h.label,
        reference: h.reference ?? null,
        description: h.notes ?? null,
        createdById: gerant.id,
      },
    });
  }
  console.log(`${historyOnly.length} entrées d'historique consignées en Kardex.`);

  await recalcStatuses(aircraft.id);
  console.log("Statuts recalculés.");
}

async function recalcStatuses(aircraftId: string) {
  const { recalcAircraftMaintenanceStatuses } = await import("../src/lib/maintenance");
  await recalcAircraftMaintenanceStatuses(prisma, aircraftId);
}

main()
  .catch((e) => {
    console.error("IMPORT ERROR", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
