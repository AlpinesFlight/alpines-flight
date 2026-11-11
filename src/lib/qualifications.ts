import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { daysLeft, kindOf } from "./qualification-catalog";
import type { LicencesData } from "@/types/models";

type Db = Prisma.TransactionClient;

const nameSelect = { select: { firstName: true, lastName: true } } as const;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Tout ce qu'affiche la rubrique Licences, en une fois : les personnes
// suivies (élèves, pilotes, instructeurs — Gérant/Admin compris s'ils
// instruisent ou ont des qualifications au dossier), leurs qualifications
// avec tout l'historique, et leurs justificatifs (jamais le contenu des
// fichiers, servi seulement par .../documents/[id]/file). onlyUserId : la
// fiche d'une seule personne (compte élève/pilote).
export async function loadLicencesData(opts: { onlyUserId?: string } = {}): Promise<LicencesData> {
  const people = await prisma.user.findMany({
    where: opts.onlyUserId
      ? { id: opts.onlyUserId }
      : {
          NOT: { email: { endsWith: "@deleted.local" } },
          OR: [{ role: "STUDENT" }, { instructorProfile: { isNot: null } }, { qualifications: { some: {} } }],
        },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      studentProfile: { select: { isPilot: true } },
      instructorProfile: { select: { id: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const userIds = people.map((p) => p.id);

  const [slots, documents] = await Promise.all([
    prisma.qualification.findMany({
      where: { userId: { in: userIds } },
      select: {
        id: true,
        userId: true,
        kind: true,
        type: true,
        label: true,
        reminderDaysBefore: true,
        lastReminderSentAt: true,
        currentValidityId: true,
        validities: {
          select: {
            id: true,
            status: true,
            variant: true,
            number: true,
            issuedAt: true,
            expiresAt: true,
            notes: true,
            rejectionReason: true,
            uploadedAt: true,
            uploadedById: true,
            uploadedBy: nameSelect,
            validatedAt: true,
            validatedBy: nameSelect,
            documents: { select: { id: true } },
          },
          orderBy: { uploadedAt: "desc" },
        },
      },
    }),
    prisma.pilotDocument.findMany({
      where: { userId: { in: userIds } },
      select: {
        id: true,
        userId: true,
        category: true,
        title: true,
        fileName: true,
        fileMimeType: true,
        fileSize: true,
        uploadedAt: true,
        uploadedById: true,
        uploadedBy: nameSelect,
        validities: { select: { id: true } },
      },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);

  return {
    people: people.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      role: p.role,
      isPilot: p.studentProfile?.isPilot ?? false,
      isInstructor: !!p.instructorProfile,
    })),
    qualifications: slots.map((q) => ({
      ...q,
      lastReminderSentAt: iso(q.lastReminderSentAt),
      validities: q.validities.map(({ documents: docs, ...v }) => ({
        ...v,
        issuedAt: iso(v.issuedAt),
        expiresAt: iso(v.expiresAt),
        uploadedAt: v.uploadedAt.toISOString(),
        validatedAt: iso(v.validatedAt),
        documentIds: docs.map((d) => d.id),
      })),
    })),
    documents: documents.map(({ validities, ...d }) => ({
      ...d,
      uploadedAt: d.uploadedAt.toISOString(),
      validityIds: validities.map((v) => v.id),
    })),
  };
}

// Une qualification justifiée — par un document importé à l'instant ou
// par des documents déjà au dossier : soit un créneau existant
// (qualificationId), soit une clé du catalogue (kind), soit une
// qualification hors catalogue (label).
export const validityInputSchema = z
  .object({
    qualificationId: z.string().optional().nullable(),
    kind: z.string().optional().nullable(),
    label: z.string().trim().optional().nullable(),
    variant: z.string().trim().optional().nullable(),
    number: z.string().trim().optional().nullable(),
    issuedAt: z.string().optional().nullable(),
    expiresAt: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .refine((v) => !!v.qualificationId || !!kindOf(v.kind) || !!v.label, {
    message: "Chaque ligne doit indiquer une qualification.",
  })
  .refine((v) => !v.issuedAt || !v.expiresAt || v.expiresAt >= v.issuedAt, {
    message: "La fin de validité ne peut pas précéder la date de délivrance.",
  });

export type ValidityInput = z.infer<typeof validityInputSchema>;

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

async function resolveSlot(db: Db, userId: string, input: ValidityInput) {
  if (input.qualificationId) {
    const slot = await db.qualification.findUnique({ where: { id: input.qualificationId } });
    if (!slot || slot.userId !== userId) throw new QualificationError("Qualification introuvable.", 404);
    return slot;
  }
  const kind = kindOf(input.kind);
  if (kind) {
    const existing = await db.qualification.findFirst({ where: { userId, kind: kind.key } });
    if (existing) return existing;
    return db.qualification.create({
      data: { userId, kind: kind.key, type: kind.category, label: kind.label, reminderDaysBefore: kind.reminderDays },
    });
  }
  const label = input.label!.trim();
  const existing = await db.qualification.findFirst({
    where: { userId, kind: null, label: { equals: label, mode: "insensitive" } },
  });
  if (existing) return existing;
  return db.qualification.create({ data: { userId, kind: null, type: "OTHER", label, reminderDaysBefore: 45 } });
}

// La validité devient la validité courante de son créneau ; l'ancienne
// courante passe en ARCHIVED (jamais supprimée).
export async function makeCurrent(db: Db, qualificationId: string, validityId: string, validatedById: string) {
  const slot = await db.qualification.findUniqueOrThrow({ where: { id: qualificationId } });
  if (slot.currentValidityId && slot.currentValidityId !== validityId) {
    await db.qualificationValidity.update({ where: { id: slot.currentValidityId }, data: { status: "ARCHIVED" } });
  }
  await db.qualificationValidity.update({
    where: { id: validityId },
    data: { status: "VALIDATED", validatedAt: new Date(), validatedById, rejectionReason: null },
  });
  await db.qualification.update({
    where: { id: qualificationId },
    data: { currentValidityId: validityId, lastReminderSentAt: null },
  });
}

// Crée une validité par ligne, reliée aux documents donnés. validated :
// saisie du staff, prise en compte immédiatement ; sinon (le pilote pour
// lui-même) elle attend la validation du staff.
export async function addValidities(
  db: Db,
  args: { userId: string; inputs: ValidityInput[]; documentIds: string[]; actorId: string; validated: boolean }
): Promise<string[]> {
  const ids: string[] = [];
  const sameDay = (a: Date | null, b: Date | null) => (a?.toISOString().slice(0, 10) ?? null) === (b?.toISOString().slice(0, 10) ?? null);
  for (const input of args.inputs) {
    const slot = await resolveSlot(db, args.userId, input);
    // Rien de changé par rapport à la validité en cours (même licence
    // renvoyée avec un nouveau scan, même date de fin...) : le document y est
    // simplement rattaché, sans créer de doublon dans l'historique.
    const current = slot.currentValidityId
      ? await db.qualificationValidity.findUnique({ where: { id: slot.currentValidityId } })
      : null;
    if (
      current &&
      (current.variant ?? null) === (input.variant || null) &&
      (current.number ?? null) === (input.number || null) &&
      sameDay(current.expiresAt, toDate(input.expiresAt)) &&
      (!input.issuedAt || sameDay(current.issuedAt, toDate(input.issuedAt)))
    ) {
      if (args.documentIds.length > 0) {
        await db.qualificationValidity.update({
          where: { id: current.id },
          data: { documents: { connect: args.documentIds.map((id) => ({ id })) } },
        });
      }
      ids.push(current.id);
      continue;
    }
    const validity = await db.qualificationValidity.create({
      data: {
        qualificationId: slot.id,
        variant: input.variant || null,
        number: input.number || null,
        issuedAt: toDate(input.issuedAt),
        expiresAt: toDate(input.expiresAt),
        notes: input.notes || null,
        status: "PENDING",
        uploadedById: args.actorId,
        documents: { connect: args.documentIds.map((id) => ({ id })) },
      },
    });
    if (args.validated) await makeCurrent(db, slot.id, validity.id, args.actorId);
    ids.push(validity.id);
  }
  return ids;
}

// Après le retrait de la validité courante : la plus récente des anciennes
// (archivées) reprend sa place, sinon le créneau n'a plus de validité en
// cours. Un créneau devenu complètement vide est supprimé.
export async function settleAfterRemoval(db: Db, qualificationId: string) {
  const slot = await db.qualification.findUnique({
    where: { id: qualificationId },
    include: { validities: { select: { id: true, status: true, expiresAt: true, issuedAt: true, uploadedAt: true } } },
  });
  if (!slot) return;
  if (slot.validities.length === 0) {
    await db.qualification.delete({ where: { id: qualificationId } });
    return;
  }
  if (slot.currentValidityId && slot.validities.some((v) => v.id === slot.currentValidityId)) return;
  const time = (d: Date | null) => d?.getTime() ?? 0;
  const previous = slot.validities
    .filter((v) => v.status === "ARCHIVED" || v.status === "VALIDATED")
    .sort(
      (a, b) =>
        time(b.expiresAt) - time(a.expiresAt) ||
        time(b.issuedAt) - time(a.issuedAt) ||
        time(b.uploadedAt) - time(a.uploadedAt)
    )[0];
  if (previous) {
    await db.qualificationValidity.update({ where: { id: previous.id }, data: { status: "VALIDATED" } });
  }
  await db.qualification.update({
    where: { id: qualificationId },
    data: { currentValidityId: previous?.id ?? null },
  });
}

export class QualificationError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
  }
}

export function composeReminderEmail(q: {
  label: string;
  currentValidity: { expiresAt: Date | null } | null;
  user: { firstName: string; lastName: string };
}) {
  const expiresAt = q.currentValidity?.expiresAt ?? null;
  // Dates de fin enregistrées à minuit UTC du jour saisi : affichées en UTC
  // pour retomber exactement sur ce jour.
  const dateStr = expiresAt
    ? expiresAt.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" })
    : "date inconnue";
  const isPast = expiresAt ? daysLeft(expiresAt) < 0 : false;

  const subject = isPast
    ? `[Alpines Flight] Échéance dépassée — ${q.label}`
    : `[Alpines Flight] Échéance à renouveler bientôt — ${q.label}`;

  const text = `Bonjour ${q.user.firstName},

${isPast ? "L'échéance suivante est dépassée" : "L'échéance suivante arrive bientôt"} :

  ${q.label}
  Fin de validité : ${dateStr}

Merci de transmettre le justificatif de renouvellement (photo ou scan) via l'application, rubrique Licences, dès que possible, afin qu'il soit vérifié et pris en compte.

Alpines Flight`;

  return { subject, text };
}
