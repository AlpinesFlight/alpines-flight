"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden fixed top-4 right-4 flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-4 py-2 shadow-lg transition-colors"
    >
      <Printer size={16} /> Imprimer / Enregistrer en PDF
    </button>
  );
}
