"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";
import {
  LayoutDashboard,
  Inbox,
  ListChecks,
  FolderKanban,
  CalendarClock,
  StickyNote,
  Contact2,
  Video,
  Wrench,
  Plane,
  GraduationCap,
  ArrowLeft,
  Search,
  Menu,
  FileText,
  Loader2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/gestion", label: "Accueil", icon: LayoutDashboard },
  { href: "/gestion/documents", label: "Documents", icon: Inbox },
  { href: "/gestion/projets", label: "Projets", icon: FolderKanban },
  { href: "/gestion/taches", label: "Tâches", icon: ListChecks },
  { href: "/gestion/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/gestion/preparation-vol", label: "Préparation vol", icon: Plane },
  { href: "/gestion/classes-virtuelles", label: "Classes virtuelles", icon: GraduationCap },
  { href: "/gestion/planning", label: "Agenda", icon: CalendarClock },
  { href: "/gestion/notes", label: "Notes", icon: StickyNote },
  { href: "/gestion/contacts", label: "Contacts", icon: Contact2 },
  { href: "/gestion/visio", label: "Visio", icon: Video },
];

type SearchResults = {
  projects: { id: string; name: string; color: string }[];
  documents: { id: string; title: string; category: string | null }[];
  tasks: { id: string; title: string; status: string }[];
  notes: { id: string; title: string }[];
  contacts: { id: string; name: string; category: string | null }[];
  events: { id: string; title: string; startTime: string }[];
};

const EMPTY_RESULTS: SearchResults = { projects: [], documents: [], tasks: [], notes: [], contacts: [], events: [] };

// Coquille "workspace" de la plateforme de gestion — fond sombre
// délibérément distinct du reste de l'appli (claire) : monter dans
// /gestion doit se sentir comme changer d'espace de travail, pas comme un
// onglet de plus. Le contrôle d'accès (Gérant uniquement) est fait en
// amont, côté serveur, par src/app/gestion/layout.tsx — cette coquille
// n'est jamais montée pour qui n'y a pas droit.
export function GestionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      apiFetch<SearchResults>(`/api/admin/search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults(EMPTY_RESULTS))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setShowResults(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const totalResults =
    results.projects.length +
    results.documents.length +
    results.tasks.length +
    results.notes.length +
    results.contacts.length +
    results.events.length;

  function goTo(href: string) {
    setQuery("");
    setShowResults(false);
    router.push(href);
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-navy-950">
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-navy-900 border-b border-navy-800">
        <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" className="p-1 -ml-1 text-cream-50">
          <Menu size={22} />
        </button>
        <span className="font-[family-name:var(--font-display)] font-bold text-base text-cream-50">Gestion</span>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={clsx(
          "fixed md:relative inset-y-0 left-0 z-50 md:z-auto",
          "w-64 shrink-0 bg-navy-900 border-r border-navy-800 flex flex-col min-h-screen overflow-y-auto",
          "transition-transform duration-200 ease-in-out md:[transform:translateX(0)]",
          mobileOpen ? "[transform:translateX(0)]" : "[transform:translateX(-100%)]"
        )}
      >
        <div className="px-4 pt-5 pb-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-medium text-navy-100/60 hover:text-cream-50 transition-colors"
          >
            <ArrowLeft size={13} /> Alpines Flight
          </Link>
          <p className="font-[family-name:var(--font-display)] font-bold text-lg text-cream-50 mt-2">Gestion</p>
          <p className="text-[11px] text-navy-100/50">Plateforme administrative</p>
        </div>

        <div className="px-3 pb-2 relative" ref={searchBoxRef}>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-100/40" />
            {searching && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-100/40 animate-spin" />}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowResults(true)}
              placeholder="Rechercher..."
              className="w-full text-sm rounded-lg border border-navy-700 bg-navy-950 pl-8 pr-7 py-1.5 text-cream-50 placeholder-navy-100/35 focus:outline-none focus:ring-2 focus:ring-sunset-500"
            />
          </div>
          {showResults && query.trim().length >= 2 && (
            <div className="absolute left-3 right-3 mt-1 bg-navy-800 rounded-xl border border-navy-700 shadow-2xl z-10 max-h-96 overflow-y-auto py-1.5">
              {totalResults === 0 && !searching && (
                <p className="px-3 py-2 text-xs text-navy-100/50">Aucun résultat pour « {query.trim()} ».</p>
              )}
              <SearchGroup label="Projets" onSeeAll={() => goTo("/gestion/projets")}>
                {results.projects.map((p) => (
                  <SearchRow key={p.id} label={p.name} onClick={() => goTo(`/gestion/projets/${p.id}`)} />
                ))}
              </SearchGroup>
              <SearchGroup label="Documents" onSeeAll={() => goTo("/gestion/documents")}>
                {results.documents.map((d) => (
                  <SearchRow key={d.id} label={d.title} sub={d.category} onClick={() => goTo("/gestion/documents")} />
                ))}
              </SearchGroup>
              <SearchGroup label="Tâches" onSeeAll={() => goTo("/gestion/taches")}>
                {results.tasks.map((t) => (
                  <SearchRow key={t.id} label={t.title} onClick={() => goTo("/gestion/taches")} />
                ))}
              </SearchGroup>
              <SearchGroup label="Notes" onSeeAll={() => goTo("/gestion/notes")}>
                {results.notes.map((n) => (
                  <SearchRow key={n.id} label={n.title} onClick={() => goTo("/gestion/notes")} />
                ))}
              </SearchGroup>
              <SearchGroup label="Contacts" onSeeAll={() => goTo("/gestion/contacts")}>
                {results.contacts.map((c) => (
                  <SearchRow key={c.id} label={c.name} sub={c.category} onClick={() => goTo("/gestion/contacts")} />
                ))}
              </SearchGroup>
              <SearchGroup label="Agenda" onSeeAll={() => goTo("/gestion/planning")}>
                {results.events.map((e) => (
                  <SearchRow key={e.id} label={e.title} onClick={() => goTo("/gestion/planning")} />
                ))}
              </SearchGroup>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/gestion" ? pathname === "/gestion" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={clsx(
                  "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                  active ? "bg-navy-800 text-cream-50 font-medium" : "text-navy-100/60 hover:bg-navy-800/60 hover:text-cream-50"
                )}
              >
                <Icon size={16} className={active ? "text-sunset-500" : "text-navy-100/40"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 text-[11px] text-navy-100/35">Visible uniquement du compte Gérant.</div>
      </aside>

      <main className="flex-1 min-w-0 bg-navy-950">{children}</main>
    </div>
  );
}

function SearchGroup({ label, onSeeAll, children }: { label: string; onSeeAll: () => void; children: React.ReactNode }) {
  const items = children as React.ReactNode[];
  const count = Array.isArray(items) ? items.filter(Boolean).length : 0;
  if (count === 0) return null;
  return (
    <div className="px-1.5">
      <div className="flex items-center justify-between px-1.5 pt-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-100/40">{label}</span>
        <button onClick={onSeeAll} className="text-[10px] text-sunset-500 hover:underline">
          Tout voir
        </button>
      </div>
      {children}
    </div>
  );
}

function SearchRow({ label, sub, onClick }: { label: string; sub?: string | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left hover:bg-navy-700/60 transition-colors"
    >
      <FileText size={13} className="text-navy-100/40 shrink-0" />
      <span className="min-w-0">
        <span className="block text-xs text-cream-50 truncate">{label}</span>
        {sub && <span className="block text-[10px] text-navy-100/40 truncate">{sub}</span>}
      </span>
    </button>
  );
}

export function GestionPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 md:px-10 pt-8 pb-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-cream-50">{title}</h1>
        {subtitle && <p className="text-navy-100/50 text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
