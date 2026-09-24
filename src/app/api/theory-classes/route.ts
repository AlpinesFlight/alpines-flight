import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeTheoryClassSelect, safeTheoryClassDocumentSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

// "Théorique Aérodynamique" -> "theorique-aerodynamique"
function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

const listSelect = { ...safeTheoryClassSelect, documents: { select: safeTheoryClassDocumentSelect } };

// Classes virtuelles (cours théoriques à distance) — page
// /gestion/classes-virtuelles, réservée au Gérant.
export async function GET() {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const classes = await prisma.theoryClass.findMany({
    select: listSelect,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(classes);
}

const postSchema = z.object({
  title: z.string().min(2),
  description: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const base = slugifyTitle(parsed.data.title) || "classe";
  const roomSlug = `AlpinesFlight-${base}-${randomSuffix()}`;

  const theoryClass = await prisma.theoryClass.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      roomSlug,
      createdById: session.user.id,
    },
    select: listSelect,
  });

  return NextResponse.json(theoryClass, { status: 201 });
}
