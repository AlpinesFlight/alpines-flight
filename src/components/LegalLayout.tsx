import Link from "next/link";
import Image from "next/image";

// Habillage commun aux pages légales publiques (/confidentialite,
// /mentions-legales) — volontairement en dehors du groupe de routes (app)
// (pas de Sidebar, pas besoin d'être connecté : ces pages doivent rester
// consultables par un visiteur non authentifié, comme l'exige le RGPD pour
// l'information des personnes concernées).
export function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-navy-50">
      <div className="bg-navy-800 px-4 py-8">
        <div className="max-w-2xl mx-auto flex flex-col items-center text-center gap-3">
          <Image
            src="/brand/logo-mark.png"
            alt="Alpines Flight"
            width={64}
            height={64}
            className="rounded-full shadow-lg"
          />
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-cream-50 tracking-tight">
              {title}
            </h1>
            <p className="text-navy-100 text-sm mt-1">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-navy-100 p-6 sm:p-8 flex flex-col gap-6 text-sm text-navy-700 leading-relaxed">
          {children}
        </div>

        <div className="flex items-center justify-center gap-4 mt-6 text-xs text-navy-500">
          <Link href="/confidentialite" className="hover:text-navy-800 hover:underline">
            Politique de confidentialité
          </Link>
          <span>·</span>
          <Link href="/mentions-legales" className="hover:text-navy-800 hover:underline">
            Mentions légales
          </Link>
          <span>·</span>
          <Link href="/login" className="hover:text-navy-800 hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-[family-name:var(--font-display)] font-bold text-navy-900 text-base">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

// Marqueur visuel explicite pour tout champ que l'école doit renseigner
// elle-même (raison sociale, SIRET, hébergeur réel...) — jamais inventé.
export function ToFill({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-sunset-100 text-sunset-700 font-medium px-1.5 py-0.5 rounded">
      [{children} — à compléter]
    </span>
  );
}
