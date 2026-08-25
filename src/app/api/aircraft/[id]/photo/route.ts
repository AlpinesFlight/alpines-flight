import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAircraftSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 Mo — photos de téléphone
// Formats affichables directement en <img> — pas de PDF/HEIC ici (contrairement
// aux documents de licences, cette photo s'affiche en ligne sur la carte avion.
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// Importe (ou remplace) la photo d'un avion, affichée sur sa carte dans la
// page Flotte. Une seule photo par avion — un nouvel envoi remplace
// l'ancienne. Admin uniquement.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.aircraft.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire invalide." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (8 Mo max)." }, { status: 400 });
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Format non accepté (JPEG, PNG ou WebP uniquement)." },
      { status: 400 }
    );
  }

  const photoData = new Uint8Array(await file.arrayBuffer());

  const aircraft = await prisma.aircraft.update({
    where: { id },
    data: {
      photoData,
      photoMimeType: file.type || "application/octet-stream",
      photoFileName: file.name,
    },
    select: safeAircraftSelect,
  });
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
    select: { photoData: true, photoMimeType: true, photoFileName: true },
  });
  if (!aircraft?.photoData) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(aircraft.photoData), {
    headers: {
      "Content-Type": aircraft.photoMimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${aircraft.photoFileName ?? "photo"}"`,
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
  const aircraft = await prisma.aircraft.update({
    where: { id },
    data: { photoData: null, photoMimeType: null, photoFileName: null },
    select: safeAircraftSelect,
  });
  return NextResponse.json(aircraft);
}
