import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

const SETTINGS_ID = "singleton";

// Réglages de la plateforme de gestion (page /gestion) — pour l'instant,
// seulement le lien Google Meet "salle habituelle" (voir GestionVisioView).
// Gérant uniquement, contrairement à /api/settings (lisible de tout compte).
export async function GET() {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await prisma.adminSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { googleMeetLink: true },
  });
  return NextResponse.json(settings ?? { googleMeetLink: null });
}

const patchSchema = z.object({
  googleMeetLink: z.string().nullable(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const settings = await prisma.adminSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, googleMeetLink: parsed.data.googleMeetLink, updatedById: session.user.id },
    update: { googleMeetLink: parsed.data.googleMeetLink, updatedById: session.user.id },
    select: { googleMeetLink: true },
  });
  return NextResponse.json(settings);
}
