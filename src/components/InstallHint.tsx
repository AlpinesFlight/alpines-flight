"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "alpines-flight-install-hint-dismissed";

// iOS Safari n'a pas de prompt d'installation automatique (contrairement à
// Chrome/Android) : c'est le seul moyen de faire découvrir "Ajouter à
// l'écran d'accueil" aux utilisateurs iPhone/iPad.
export function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Stockage indisponible (navigation privée...) : on affiche quand
      // même, ce n'est qu'un confort d'affichage.
    }

    setVisible(isIOS && !isStandalone && !dismissed);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Rien de plus à faire si le stockage est indisponible.
    }
  }

  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 bg-navy-800 text-cream-50 px-4 py-2.5 text-sm">
      <Share size={16} className="shrink-0" />
      <p className="min-w-0">
        Installe l&apos;appli : appuie sur <span className="font-semibold">Partager</span> puis{" "}
        <span className="font-semibold">« Sur l&apos;écran d&apos;accueil »</span>.
      </p>
      <button
        onClick={dismiss}
        aria-label="Fermer"
        className="ml-auto shrink-0 text-navy-100/60 hover:text-cream-50 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}
