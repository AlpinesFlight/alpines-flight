import { NextResponse } from "next/server";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAircraftSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { get, del, head } from "@vercel/blob";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

// La photo elle-même est déjà envoyée à Vercel Blob par le navigateur avant
// cet appel (voir .../photo/blob-upload et FleetView.tsx) — ce POST ne fait
// plus qu'enregistrer son URL. Importe (ou remplace) la photo d'un avion,
// affichée sur sa carte dans la page Flotte. Une seule photo par avion — un
// nouvel envoi remplace l'ancienne. Admin uniquement.
const createSchema = z.object({
  fileName: z.string().min(1),
  blobUrl: z.string().url(),
});

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.aircraft.findUnique({ where: { id }, select: { photoBlobUrl: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  let meta;
  try {
    meta = await head(parsed.data.blobUrl);
  } catch {
    return NextResponse.json(
      { error: "Fichier introuvable dans le stockage — réessaie l'envoi." },
      { status: 400 }
    );
  }

  const aircraft = await prisma.aircraft.update({
    where: { id },
    data: {
      photoBlobUrl: parsed.data.blobUrl,
      photoData: null,
      photoMimeType: meta.contentType || "application/octet-stream",
      photoFileName: parsed.data.fileName,
    },
    select: safeAircraftSelect,
  });

  // L'ancienne photo (si elle était déjà dans Blob) est remplacée — la
  // supprimer évite un fichier orphelin. Après l'écriture réussie en base,
  // pour ne jamais perdre le pointeur vers l'ancien fichier si ça échouait
  // avant.
  if (existing.photoBlobUrl && existing.photoBlobUrl !== parsed.data.blobUrl) {
    try {
      await del(existing.photoBlobUrl);
    } catch (err) {
      console.error(`Suppression de l'ancienne photo Blob de Aircraft ${id} échouée :`, err);
    }
  }

  return NextResponse.json(aircraft);
}

// Diffuse la photo en streaming — jamais en JSON (voir safeAircraftSelect).
// Accessible à tout utilisateur connecté : une photo d'avion n'est pas une
// donnée sensible, contrairement aux documents de licences.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const aircraft = await prisma.aircraft.findUnique({
    where: { id },
    select: { photoData: true, photoMimeType: true, photoFileName: true, photoBlobUrl: true },
  });
  if (!aircraft || (!aircraft.photoData && !aircraft.photoBlobUrl)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const disposition = `inline; filename="${aircraft.photoFileName ?? "photo"}"`;

  if (aircraft.photoBlobUrl) {
    const blob = await get(aircraft.photoBlobUrl, { access: "private" });
    if (!blob || blob.stream === null) {
      return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 404 });
    }
    return new NextResponse(blob.stream, {
      headers: {
        "Content-Type": aircraft.photoMimeType || "application/octet-stream",
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  return new NextResponse(new Uint8Array(aircraft.photoData!), {
    headers: {
      "Content-Type": aircraft.photoMimeType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// Retire la photo (revient à l'icône par défaut). Admin uniquement.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.aircraft.findUnique({ where: { id }, select: { photoBlobUrl: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const aircraft = await prisma.aircraft.update({
    where: { id },
    data: { photoData: null, photoBlobUrl: null, photoMimeType: null, photoFileName: null },
    select: safeAircraftSelect,
  });

  if (existing.photoBlobUrl) {
    try {
      await del(existing.photoBlobUrl);
    } catch (err) {
      console.error(`Suppression de la photo Blob de Aircraft ${id} échouée :`, err);
    }
  }

  return NextResponse.json(aircraft);
}
