import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

// Agenda administratif (banque, DGAC, échéances fiscales...) — page
// /gestion, réservée au Gérant. Distinct du planning des vols
// (Reservation) : ici, aucun lien avec un avion/élève/instructeur.
export async function GET() {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const events = await prisma.adminEvent.findMany({
    include: { createdBy: { select: safeUserSelect } },
    orderBy: { startTime: "asc" },
  });
  return NextResponse.json(events);
}

const createSchema = z.object({
  title: z.string().min(1, "Le titre est requis."),
  category: z.string().optional().nullable(),
  startTime: z.string(),
  endTime: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const { title, category, startTime, endTime, location, notes } = parsed.data;
  const event = await prisma.adminEvent.create({
    data: {
      title,
      category: category || null,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      location: location || null,
      notes: notes || null,
      createdById: session.user.id,
    },
    include: { createdBy: { select: safeUserSelect } },
  });
  return NextResponse.json(event, { status: 201 });
}
