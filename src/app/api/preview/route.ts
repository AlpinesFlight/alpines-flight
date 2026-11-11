import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { zodErrorMessage } from "@/lib/api-errors";
import { auth, unstable_update, PREVIEW_COOKIE, PREVIEW_DURATION_MS } from "@/lib/auth";

// Aperçu "Voir en tant que" (Gérant) — voir src/lib/auth.ts pour le
// principe et les contrôles. Cette route ne fait que demander la mise à jour
// du jeton et poser/retirer le cookie qui active la lecture seule dans
// src/proxy.ts (et qui y reste autorisée pendant l'aperçu, pour pouvoir en
// sortir).
const startSchema = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Premier filtre seulement : la vérification qui compte (Gérant en base)
  // est faite au moment de modifier le jeton, voir startPreview.
  if (!session.preview && session.user.role !== "GERANT") {
    return NextResponse.json({ error: "Réservé au Gérant." }, { status: 403 });
  }

  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });

  const updated = await unstable_update({ previewUserId: parsed.data.userId } as never);
  if (!updated?.preview || updated.user?.id !== parsed.data.userId) {
    return NextResponse.json({ error: "Impossible d'afficher ce compte." }, { status: 400 });
  }

  (await cookies()).set(PREVIEW_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PREVIEW_DURATION_MS / 1000,
  });
  console.info(`Aperçu : ${updated.preview.realName} voit l'appli comme ${updated.user.name} (${updated.user.role})`);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (session?.preview) await unstable_update({ previewStop: true } as never);
  (await cookies()).delete(PREVIEW_COOKIE);
  return NextResponse.json({ ok: true });
}
