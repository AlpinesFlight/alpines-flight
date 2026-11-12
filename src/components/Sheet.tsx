"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Fenêtre de la réservation : panneau qui monte du bas sur téléphone (plus
// simple à manier au pouce, le planning reste deviné derrière), boîte
// centrée sur ordinateur. En-tête fixe, contenu qui défile, et chaque
// formulaire pose sa propre barre d'actions collante en bas (SheetFooter).
// Pas de fermeture au clic sur le fond : un formulaire à moitié rempli ne
// doit pas se perdre sur un clic à côté — Échap ou la croix.
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    // Le planning derrière ne doit pas défiler en même temps que le panneau.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="af-backdrop absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="af-sheet relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="sm:hidden flex justify-center pt-2.5" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-navy-100" />
        </div>
        <header className="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-navy-900 leading-tight">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-navy-500 mt-0.5 first-letter:uppercase">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 -mr-1.5 -mt-1 h-9 w-9 grid place-items-center rounded-full text-navy-500 hover:bg-navy-50 hover:text-navy-900 transition-colors"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

// Barre d'actions collée en bas du panneau, visible même quand le
// formulaire défile.
export function SheetFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-navy-100 px-5 py-3 flex items-center gap-3">
      {children}
    </div>
  );
}

// Bloc titré contenant des boutons (choix d'avion, durées…) — un <section>
// et pas un <label> : un label qui englobe des boutons déclencherait le
// premier d'entre eux au clic sur son texte.
export function SheetSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-navy-500">{label}</h3>
      {children}
    </section>
  );
}

// Champ simple (un seul input/select) avec son libellé.
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-xs font-semibold text-navy-500">{label}</span>
      {children}
    </label>
  );
}
