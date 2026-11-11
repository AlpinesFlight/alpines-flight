// Reprise (2026-11-11) des licences saisies avant la refonte : à lancer
// APRÈS la migration licences_justificatifs (qui a déjà recopié chaque
// fichier dans PilotDocument).
//
// 1. Rattache chaque qualification au catalogue (Qualification.kind) d'après
//    son ancien libellé libre — "SEP terrestre", "SEP(T)", "Fi (A)" saisi
//    comme licence, "Class 1"... — avec libellé, catégorie et rappel du
//    catalogue (rappel inchangé s'il avait été réglé autrement que 45 j), et
//    la précision (classe médicale, type de licence) sur ses validités.
// 2. Range au bon endroit une validité SEP importée par erreur dans le
//    créneau "certificat médical" (fichier "SEP ..."), où elle avait été
//    archivée et donc masquée.
// 3. Fusionne les justificatifs importés deux fois à l'identique (même
//    personne, même nom, même taille, même contenu) : un seul document,
//    relié à toutes les qualifications qu'il justifiait. Aucun fichier n'est
//    supprimé du stockage.
//
// Usage : npx tsx prisma/migrate-licences-catalog.ts          (à blanc)
//         npx tsx prisma/migrate-licences-catalog.ts --apply  (écrit)
process.loadEnvFile(".env");
import { createHash } from "node:crypto";
import { PrismaClient, QualificationType } from "@prisma/client";
import { get } from "@vercel/blob";
import { kindOf } from "../src/lib/qualification-catalog";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

function medicalVariant(text: string): string | null {
  if (/class(e)?\s*1\s*(&|et)\s*2/i.test(text)) return "Classe 1 & 2";
  if (/class(e)?\s*1/i.test(text)) return "Classe 1";
  if (/class(e)?\s*2/i.test(text)) return "Classe 2";
  if (/lapl/i.test(text)) return "LAPL";
  return null;
}

function licenceVariant(text: string): string | null {
  if (/\batpl\b/i.test(text)) return "ATPL(A)";
  if (/\bcpl\b/i.test(text)) return "CPL(A)";
  if (/\blapl\b/i.test(text)) return "LAPL(A)";
  if (/\bppl\b/i.test(text)) return "PPL(A)";
  if (/\bulm\b/i.test(text)) return "ULM";
  return null;
}

function deriveKind(type: QualificationType, label: string): { kind: string | null; variant: string | null } {
  const l = label.trim();
  if (type === "MEDICAL") return { kind: "MEDICAL", variant: medicalVariant(l) };
  if (/\bfi\b/i.test(l)) return { kind: "FI", variant: null };
  if (/\bfe\b/i.test(l)) return { kind: "FE", variant: null };
  if (/\bcri\b/i.test(l)) return { kind: "CRI", variant: null };
  if (/\bmep\b/i.test(l)) return { kind: "MEP", variant: null };
  if (/\bsep\b/i.test(l)) return { kind: "SEP", variant: null };
  if (/\bnuit\b|\bnight\b/i.test(l)) return { kind: "NIGHT", variant: null };
  if (/montagne|mountain/i.test(l)) return { kind: "MOUNTAIN", variant: null };
  if (/anglais|english/i.test(l)) return { kind: "LANG_EN", variant: null };
  if (type === "LICENSE") {
    const variant = licenceVariant(l);
    if (variant) return { kind: "LICENCE", variant };
  }
  return { kind: null, variant: null };
}

async function contentHash(doc: { blobUrl: string | null; fileData: Uint8Array | null }): Promise<string | null> {
  if (doc.fileData) return createHash("sha256").update(doc.fileData).digest("hex");
  if (!doc.blobUrl) return null;
  const blob = await get(doc.blobUrl, { access: "private" });
  if (!blob?.stream) return null;
  const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const people = new Map(
    (await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true } })).map((u) => [
      u.id,
      `${u.firstName} ${u.lastName}`,
    ])
  );
  const slots = await prisma.qualification.findMany({
    include: { validities: { include: { documents: { select: { id: true, fileName: true, category: true } } } } },
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
  });

  type Op = () => Promise<unknown>;
  const ops: { describe: string; run: Op[] }[] = [];

  // 1. Catalogue
  for (const slot of slots) {
    if (slot.kind) continue;
    const { kind: key, variant } = deriveKind(slot.type, slot.label);
    const kind = kindOf(key);
    if (!kind) {
      ops.push({ describe: `${people.get(slot.userId)} — « ${slot.label} » : laissé hors catalogue`, run: [] });
      continue;
    }
    const reminder = slot.reminderDaysBefore === 45 ? kind.reminderDays : slot.reminderDaysBefore;
    const run: Op[] = [
      () =>
        prisma.qualification.update({
          where: { id: slot.id },
          data: { kind: kind.key, type: kind.category, label: kind.label, reminderDaysBefore: reminder },
        }),
    ];
    if (variant) {
      run.push(() =>
        prisma.qualificationValidity.updateMany({ where: { qualificationId: slot.id, variant: null }, data: { variant } })
      );
    }
    ops.push({
      describe: `${people.get(slot.userId)} — « ${slot.label} » (${slot.type}) → ${kind.key} « ${kind.label} »${
        variant ? `, précision « ${variant} »` : ""
      }, rappel ${slot.reminderDaysBefore} → ${reminder} j`,
      run,
    });
  }

  // 2. Validité SEP rangée par erreur sous le certificat médical
  for (const slot of slots.filter((s) => s.type === "MEDICAL" || s.kind === "MEDICAL")) {
    const misfiled = slot.validities.filter(
      (v) => v.id !== slot.currentValidityId && v.documents.some((d) => /^\s*SEP\b/i.test(d.fileName))
    );
    for (const v of misfiled) {
      const sepSlot = slots.find((s) => s.userId === slot.userId && s.id !== slot.id && /\bsep\b/i.test(s.label));
      const sep = kindOf("SEP")!;
      ops.push({
        describe: `${people.get(slot.userId)} — validité « ${v.documents[0].fileName} » (fin ${
          v.expiresAt?.toISOString().slice(0, 10) ?? "—"
        }) déplacée du médical vers SEP${sepSlot ? "" : " (créé)"}, et rendue courante si le SEP n'en a pas`,
        run: [
          async () => {
            const target =
              sepSlot ??
              (await prisma.qualification.create({
                data: {
                  userId: slot.userId,
                  kind: sep.key,
                  type: sep.category,
                  label: sep.label,
                  reminderDaysBefore: sep.reminderDays,
                },
              }));
            const fresh = await prisma.qualification.findUniqueOrThrow({ where: { id: target.id } });
            await prisma.qualificationValidity.update({
              where: { id: v.id },
              data: {
                qualificationId: target.id,
                variant: null,
                status: fresh.currentValidityId ? "ARCHIVED" : "VALIDATED",
              },
            });
            if (!fresh.currentValidityId) {
              await prisma.qualification.update({ where: { id: target.id }, data: { currentValidityId: v.id } });
            }
            await prisma.pilotDocument.updateMany({
              where: { id: { in: v.documents.map((d) => d.id) }, category: "MEDICAL" },
              data: { category: "LICENCE" },
            });
          },
        ],
      });
    }
  }

  // 3. Justificatifs importés deux fois à l'identique
  const docs = await prisma.pilotDocument.findMany({
    select: {
      id: true,
      userId: true,
      fileName: true,
      fileSize: true,
      blobUrl: true,
      fileData: true,
      uploadedAt: true,
      validities: { select: { id: true } },
    },
    orderBy: { uploadedAt: "asc" },
  });
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const k = `${d.userId}|${d.fileName}|${d.fileSize}`;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const hashes = await Promise.all(group.map(contentHash));
    if (!hashes[0] || hashes.some((h) => h !== hashes[0])) {
      ops.push({ describe: `« ${group[0].fileName} » : même nom mais contenu différent, laissé tel quel`, run: [] });
      continue;
    }
    const [keep, ...dupes] = group;
    ops.push({
      describe: `${people.get(keep.userId)} — « ${keep.fileName} » importé ${group.length} fois à l'identique : un seul justificatif, relié à ${
        group.flatMap((d) => d.validities).length
      } validité(s)`,
      run: [
        () =>
          prisma.pilotDocument.update({
            where: { id: keep.id },
            data: { validities: { connect: dupes.flatMap((d) => d.validities.map((v) => ({ id: v.id }))) } },
          }),
        () => prisma.pilotDocument.deleteMany({ where: { id: { in: dupes.map((d) => d.id) } } }),
      ],
    });
  }

  for (const op of ops) console.log(`${op.run.length === 0 ? "  =" : apply ? "  ✓" : "  →"} ${op.describe}`);
  if (!apply) {
    console.log(`\n${ops.filter((o) => o.run.length > 0).length} changement(s) — à blanc, rien d'écrit (--apply pour écrire)`);
    return;
  }
  for (const op of ops) for (const run of op.run) await run();
  console.log("\nÉcrit.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
