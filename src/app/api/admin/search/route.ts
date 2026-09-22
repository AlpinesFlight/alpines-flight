import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGerant } from "@/lib/permissions";

// Recherche transversale (barre de recherche façon Notion, GestionShell) —
// projets, documents, tâches, notes, contacts et agenda en une seule
// requête. Limité à 5 résultats par catégorie : c'est un accès rapide, pas
// une page de résultats à faire défiler.
export async function GET(req: Request) {
  const session = await auth();
  if (!session || !isGerant(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2)
    return NextResponse.json({ projects: [], documents: [], tasks: [], notes: [], contacts: [], events: [] });

  const take = 5;
  const [projects, documents, tasks, notes, contacts, events] = await Promise.all([
    prisma.adminProject.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, color: true },
      take,
    }),
    prisma.adminDocument.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, category: true },
      take,
    }),
    prisma.adminTask.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, status: true },
      take,
    }),
    prisma.adminNote.findMany({
      where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] },
      select: { id: true, title: true },
      take,
    }),
    prisma.adminContact.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, category: true },
      take,
    }),
    prisma.adminEvent.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, startTime: true },
      take,
    }),
  ]);

  return NextResponse.json({ projects, documents, tasks, notes, contacts, events });
}
