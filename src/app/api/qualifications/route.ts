import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeDocumentSelect } from "@/lib/selects";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedUserId = searchParams.get("userId");
  // Un élève ne voit que ses propres qualifications ; le staff pédagogique
  // (FI et au-dessus) voit tout le monde, utile pour vérifier la validité
  // d'une licence/médicale avant d'autoriser un vol.
  const userId = isInstructorOrAbove(session.user.role) ? requestedUserId : session.user.id;

  const qualifications = await prisma.qualification.findMany({
    where: userId ? { userId } : undefined,
    select: {
      id: true,
      userId: true,
      user: { select: safeUserSelect },
      type: true,
      label: true,
      reminderDaysBefore: true,
      lastReminderSentAt: true,
      currentDocumentId: true,
      currentDocument: { select: safeDocumentSelect },
      documents: { select: safeDocumentSelect, orderBy: { uploadedAt: "desc" } },
    },
    orderBy: [{ user: { lastName: "asc" } }, { label: "asc" }],
  });
  return NextResponse.json(qualifications);
}

const createSchema = z.object({
  userId: z.string(),
  type: z.enum([
    "LICENSE",
    "MEDICAL",
    "CLASS_RATING",
    "VARIANT",
    "ADDITIONAL",
    "INSTRUCTOR_PRIV",
    "EXAMINER_PRIV",
    "OTHER",
  ]),
  label: z.string().min(1),
  reminderDaysBefore: z.number().int().positive().default(45),
});

// Crée un créneau de qualification vide (sans document). Un admin peut le
// faire pour n'importe qui ; un élève/instructeur seulement pour lui-même —
// en pratique ce créneau se crée généralement en même temps que le premier
// document importé (voir /api/qualifications/documents).
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (!canManageSchool(session.user.role) && parsed.data.userId !== session.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const qualification = await prisma.qualification.create({ data: parsed.data });
  return NextResponse.json(qualification, { status: 201 });
}
