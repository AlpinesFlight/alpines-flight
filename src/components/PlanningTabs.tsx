"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { clsx } from "clsx";
import { canSeeInstructorAvailability } from "@/lib/permissions";

// Bascule entre le Planning avions et sa "sous-page" Disponibilités FI
// (voir planning/page.tsx et planning/disponibilites/page.tsx) — le
// second onglet n'apparaît que pour les comptes qui y ont accès (FI et
// Gérant), pas juste masqué en CSS : absent du DOM pour les autres rôles.
export function PlanningTabs() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (!canSeeInstructorAvailability(session?.user?.role)) return null;

  const tabs = [
    { href: "/planning", label: "Planning avions" },
    { href: "/planning/disponibilites", label: "Disponibilités FI" },
  ];

  return (
    <div className="flex gap-1 px-4 md:px-8 pt-3 border-b border-navy-100 bg-cream-50 overflow-x-auto">
      {tabs.map((t) => {
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
