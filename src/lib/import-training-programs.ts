import { readFileSync, readdirSync } from "fs";
import path from "path";
import { prisma } from "./prisma";

// Dossier où le responsable pédagogique tient ses fichiers de programme
// (format JSON structuré "4fly", un fichier par programme). Peut être
// redéfini via la variable d'environnement TRAINING_PROGRAMS_DIR si ce
// dossier change ou si l'appli tourne un jour sur une autre machine.
const DEFAULT_DIR =
  "C:\\Users\\tomgr\\Documents\\Base de données Claude IA\\01- DTO\\01- Doc formation 4Fly";

interface RawExercise {
  numero: string | number;
  intitule: string;
  type?: string;
  objectifs?: string[];
  contenu?: string[];
  criteres_validation?: string;
  duree_indicative_h?: number;
  bloquant_pour?: string;
  note?: string;
}

interface RawPhase {
  code: string;
  intitule: string;
  objectif_general?: string;
  exercices: RawExercise[];
}

interface RawProgram {
  id: string;
  formation: {
    intitule: string;
    categorie?: string;
    modalite?: string;
    reference_reglementaire?: string[] | string;
    sanction?: string;
  };
  volumes?: { total_h?: number; duree_totale_h?: number | string };
  structure_pedagogique?: { niveaux_de_validation?: string[] };
  phases?: RawPhase[];
  _meta?: { genere_le?: string; revision?: string };
}

function normalizeType(t?: string): "SOL" | "DC" | "SOLO" | "TEST" | "DC_SOLO" {
  switch ((t || "").toUpperCase().replace(/\s+/g, "")) {
    case "SOL":
      return "SOL";
    case "DC":
      return "DC";
    case "SOLO":
      return "SOLO";
    case "TEST":
      return "TEST";
    case "DC/SOLO":
      return "DC_SOLO";
    default:
      return "DC";
  }
}

export interface ImportedProgramSummary {
  file: string;
  programCode: string;
  title: string;
  phases: number;
  exercises: number;
}

export interface ImportError {
  file: string;
  error: string;
}

export interface ImportReport {
  dir: string;
  imported: ImportedProgramSummary[];
  skippedSuperseded: { file: string; keptFile: string; programCode: string }[];
  errors: ImportError[];
}

/**
 * Importe (upsert) les programmes de formation depuis les fichiers JSON du
 * dossier source. Idempotent : ré-exécutable sans dupliquer ni casser la
 * progression déjà saisie des élèves (phases/exercices identifiés par
 * (programme, code) et (phase, numéro), mis à jour en place plutôt que
 * recréés).
 *
 * Si deux fichiers partagent le même `id` de programme (ex. une révision
 * ENAC → ANPI), seul le plus récent (`_meta.genere_le`) est importé.
 */
export async function importTrainingPrograms(dir?: string): Promise<ImportReport> {
  const programsDir = dir || process.env.TRAINING_PROGRAMS_DIR || DEFAULT_DIR;
  const report: ImportReport = { dir: programsDir, imported: [], skippedSuperseded: [], errors: [] };

  let filenames: string[];
  try {
    filenames = readdirSync(programsDir)
      .filter((f) => f.endsWith(".json") && f !== "00_index.json")
      .sort();
  } catch (err) {
    throw new Error(
      `Impossible de lire le dossier des programmes de formation (${programsDir}) : ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // 1ʳᵉ passe : charge tout, regroupe par id de programme, ne garde que le
  // plus récent en cas de doublon (ex. révision de référentiel).
  const byId = new Map<string, { file: string; raw: RawProgram }>();
  for (const file of filenames) {
    try {
      const raw: RawProgram = JSON.parse(readFileSync(path.join(programsDir, file), "utf-8"));
      if (!raw.id || !raw.phases || raw.phases.length === 0) {
        report.errors.push({ file, error: "Fichier sans id ou sans phases, ignoré." });
        continue;
      }
      const existing = byId.get(raw.id);
      if (!existing) {
        byId.set(raw.id, { file, raw });
      } else {
        const existingDate = existing.raw._meta?.genere_le ?? "";
        const currentDate = raw._meta?.genere_le ?? "";
        if (currentDate >= existingDate) {
          report.skippedSuperseded.push({ file: existing.file, keptFile: file, programCode: raw.id });
          byId.set(raw.id, { file, raw });
        } else {
          report.skippedSuperseded.push({ file, keptFile: existing.file, programCode: raw.id });
        }
      }
    } catch (err) {
      report.errors.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 2ᵉ passe : upsert en base.
  for (const { file, raw } of byId.values()) {
    try {
      const code = raw.id;
      const volumes = raw.volumes;
      const volumeLabel =
        volumes?.total_h != null
          ? String(volumes.total_h)
          : volumes?.duree_totale_h != null
          ? String(volumes.duree_totale_h)
          : null;
      const referenceReglementaire = Array.isArray(raw.formation.reference_reglementaire)
        ? raw.formation.reference_reglementaire.join(" ; ")
        : raw.formation.reference_reglementaire ?? null;

      const program = await prisma.trainingProgram.upsert({
        where: { code },
        create: {
          code,
          title: raw.formation.intitule,
          category: raw.formation.categorie ?? null,
          modality: raw.formation.modalite ?? null,
          referenceReglementaire,
          sanction: raw.formation.sanction ?? null,
          volumeLabel,
          notationScale: raw.structure_pedagogique?.niveaux_de_validation ?? undefined,
          sourceFile: file,
          importedAt: new Date(),
        },
        update: {
          title: raw.formation.intitule,
          category: raw.formation.categorie ?? null,
          modality: raw.formation.modalite ?? null,
          referenceReglementaire,
          sanction: raw.formation.sanction ?? null,
          volumeLabel,
          notationScale: raw.structure_pedagogique?.niveaux_de_validation ?? undefined,
          sourceFile: file,
          importedAt: new Date(),
        },
      });

      let exerciseCount = 0;
      const phases = raw.phases ?? [];
      for (let pIdx = 0; pIdx < phases.length; pIdx++) {
        const rp = phases[pIdx];
        const phase = await prisma.trainingPhase.upsert({
          where: { programId_code: { programId: program.id, code: rp.code } },
          create: {
            programId: program.id,
            code: rp.code,
            order: pIdx,
            title: rp.intitule,
            objectifGeneral: rp.objectif_general ?? null,
          },
          update: {
            order: pIdx,
            title: rp.intitule,
            objectifGeneral: rp.objectif_general ?? null,
          },
        });

        const exercices = rp.exercices ?? [];
        for (let eIdx = 0; eIdx < exercices.length; eIdx++) {
          const re = exercices[eIdx];
          const numero = String(re.numero);
          await prisma.trainingExercise.upsert({
            where: { phaseId_numero: { phaseId: phase.id, numero } },
            create: {
              phaseId: phase.id,
              order: eIdx,
              numero,
              intitule: re.intitule,
              type: normalizeType(re.type),
              objectifs: re.objectifs ?? undefined,
              contenu: re.contenu ?? undefined,
              criteresValidation: re.criteres_validation ?? null,
              dureeIndicativeH: re.duree_indicative_h ?? null,
              bloquantPour: re.bloquant_pour ?? null,
              note: re.note ?? null,
            },
            update: {
              order: eIdx,
              intitule: re.intitule,
              type: normalizeType(re.type),
              objectifs: re.objectifs ?? undefined,
              contenu: re.contenu ?? undefined,
              criteresValidation: re.criteres_validation ?? null,
              dureeIndicativeH: re.duree_indicative_h ?? null,
              bloquantPour: re.bloquant_pour ?? null,
              note: re.note ?? null,
            },
          });
          exerciseCount++;
        }
      }

      report.imported.push({
        file,
        programCode: code,
        title: raw.formation.intitule,
        phases: phases.length,
        exercises: exerciseCount,
      });
    } catch (err) {
      report.errors.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return report;
}
