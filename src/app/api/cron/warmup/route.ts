import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Neon (plan gratuit) met le compute en veille après 5 min d'inactivité —
// la requête suivante paie alors un "cold start" mesuré à ~700-1000ms de
// plus (contre ~50ms une fois réveillé), voir l'audit perf de ce commit.
// Impossible de désactiver cette veille sans passer sur un plan Neon
// payant (limite du plan gratuit, pas un réglage) — et impossible de le
// contourner par un ping régulier : Vercel Hobby limite les Cron Jobs à
// une fois par jour, et même si ce n'était pas le cas, maintenir le
// compute éveillé en continu dépasserait largement le quota gratuit de
// 100h de compute/mois (~720h nécessaires pour du 24/7).
//
// Ce que ce cron fait à la place, dans ces limites : réveille le compute
// une fois par jour peu avant l'ouverture (voir vercel.json), pour que la
// première personne qui ouvre l'appli le matin ne paie pas elle-même ce
// délai. Le compute se rendort ensuite normalement après 5 min sans
// activité réelle — coût de compute négligeable (quelques minutes/jour).
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true, ms: Date.now() - start });
}
