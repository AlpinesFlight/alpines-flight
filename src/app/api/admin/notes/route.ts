import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

// Pense-bête/wiki interne (page /gestion) — réservé au Gérant. Les notes
// épinglées remontent en premier, puis les plus récemment modifiées.
export async function GET() {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const notes = await prisma.adminNote.findMany({
    include: { createdBy: { select: safeUserSelect } },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json(notes);
}

const createSchema = z.object({
  title: z.string().min(1, "Le titre est requis."),
  content: z.string().optional().default(""),
  pinned: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const note = await prisma.adminNote.create({
    data: { ...parsed.data, createdById: session.user.id },
    include: { createdBy: { select: safeUserSelect } },
  });
  return NextResponse.json(note, { status: 201 });
}
