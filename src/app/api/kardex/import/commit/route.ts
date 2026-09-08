import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalcAircraftMaintenanceStatuses } from "@/lib/maintenance";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

const rowSchema = z.object({
  cnNumber: z.string().nullable().optional(),
  label: z.string().min(1),
  category: z.enum(["VISITE", "REPARATION", "CONSIGNE_NAVIGABILITE", "PIECE_REMPLACEE", "AUTRE"]),
  appliedDate: z.string().nullable().optional(),
  appliedHours: z.number().nonnegative().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueHours: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const schema = z.object({
  aircraftId: z.string().min(1),
  rows: z.array(rowSchema).min(1, "Aucune ligne à importer."),
});

// Étape 2/2 : écrit en base les lignes que le Gérant a gardées/ajustées à
// l'écran de relecture (voir POST /api/kardex/import/parse pour l'étape
// 1). Ne matche jamais une ligne importée à une échéance déjà existante
// (pas d'heuristique de rapprochement par libellé, trop risquée sur des
// données de navigabilité) : réservé à un premier import du Kardex papier
// pour un avion qui n'en a pas encore dans l'appli — réimporter le même
// fichier deux fois créerait des doublons, à éviter côté utilisation.
//
// Chaque ligne avec une échéance (dueDate ou dueHours) devient une
// MaintenanceRecord (suivie ensuite comme n'importe quelle échéance de
// l'appli, alertes comprises) ; toutes les lignes deviennent en plus une
// KardexEntry (trace de la dernière application), reliée à cette
// MaintenanceRecord le cas échéant. Une ligne avec les deux types
// d'échéance (date ET heures, cas fréquent du fichier réel) est suivie par
// les heures — plus pertinent pour une école qui compte ses heures de vol
// précisément — l'échéance calendaire correspondante reste tracée dans les
// notes plutôt que perdue.
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const aircraft = await prisma.aircraft.findUnique({ where: { id: parsed.data.aircraftId } });
  if (!aircraft) return NextResponse.json({ error: "Avion introuvable." }, { status: 404 });

  let maintenanceRecordsCreated = 0;
  let kardexEntriesCreated = 0;

  await prisma.$transaction(async (db) => {
    for (const row of parsed.data.rows) {
      let maintenanceRecordId: string | null = null;

      if (row.dueDate || row.dueHours != null) {
        const notesParts = [row.notes].filter((n): n is string => !!n);
        // L'échéance non retenue comme type suivi reste visible ici, pas perdue.
        if (row.dueHours != null && row.dueDate) {
          notesParts.push(`Échéance calendaire associée : ${row.dueDate}`);
        }
        const record = await db.maintenanceRecord.create({
          data: {
            aircraftId: aircraft.id,
            label: row.cnNumber ? `${row.cnNumber} — ${row.label}` : row.label,
            type: row.dueHours != null ? "HOURLY" : "CALENDAR",
            dueAtHours: row.dueHours != null ? row.dueHours : null,
            dueAtDate: row.dueHours == null && row.dueDate ? new Date(row.dueDate) : null,
            notes: notesParts.length > 0 ? notesParts.join(" — ") : null,
          },
        });
        maintenanceRecordId = record.id;
        maintenanceRecordsCreated++;
      }

      await db.kardexEntry.create({
        data: {
          aircraftId: aircraft.id,
          date: row.appliedDate ? new Date(row.appliedDate) : new Date(),
          hoursAt: row.appliedHours ?? null,
          category: row.category,
          title: row.cnNumber ? `${row.cnNumber} — ${row.label}` : row.label,
          description: row.notes ?? null,
          maintenanceRecordId,
          createdById: session.user.id,
        },
      });
      kardexEntriesCreated++;
    }
  });

  await recalcAircraftMaintenanceStatuses(prisma, aircraft.id);

  return NextResponse.json({ maintenanceRecordsCreated, kardexEntriesCreated }, { status: 201 });
}
