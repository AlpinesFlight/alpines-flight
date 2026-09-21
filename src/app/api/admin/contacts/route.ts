import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { isGerant } from "@/lib/permissions";
import { z } from "zod";

// Annuaire (CRM léger) des contacts externes de la société — comptable,
// banque, assurance, fournisseurs... (page /gestion, réservé au Gérant).
export async function GET() {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contacts = await prisma.adminContact.findMany({
    include: { createdBy: { select: safeUserSelect } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(contacts);
}

const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  category: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
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

  const { name, category, phone, email, notes } = parsed.data;
  const contact = await prisma.adminContact.create({
    data: {
      name,
      category: category || null,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      createdById: session.user.id,
    },
    include: { createdBy: { select: safeUserSelect } },
  });
  return NextResponse.json(contact, { status: 201 });
}
