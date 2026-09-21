"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";

const TABS = [
  { href: "/gestion", label: "Documents" },
  { href: "/gestion/taches", label: "Tâches" },
  { href: "/gestion/planning", label: "Agenda" },
  { href: "/gestion/visio", label: "Visio" },
];

// Bascule entre les 4 volets de la plateforme de gestion — page entière
// réservée au Gérant (voir isGerant), donc pas de filtrage par onglet ici :
// GestionGate (dans chaque *View.tsx) bloque déjà tout le reste pour qui
// n'est pas Gérant, et cette barre n'est de toute façon montée qu'à
// l'intérieur d'une page /gestion/*.
export function GestionTabs() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (session?.user?.role !== "GERANT") return null;

  return (
    <div className="flex gap-1 px-4 md:px-8 pt-3 border-b border-navy-100 bg-cream-50 overflow-x-auto">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            className={clsx(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap",
              active ? "border-sunset-500 text-navy-900" : "border-transparent text-navy-600 hover:text-navy-900"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
