import Link from "next/link";
import { auth } from "@/lib/auth";
import { isGerant } from "@/lib/permissions";
import { GestionShell } from "@/components/GestionShell";
import { ShieldAlert } from "lucide-react";

// Route volontairement HORS du groupe (app) (voir src/app/(app)/layout.tsx) :
// la plateforme de gestion doit se sentir comme un espace de travail à
// part, pas comme une page de plus sous la sidebar de l'exploitation de
// l'école — voir GestionShell. Contrôle d'accès fait ici, côté serveur
// (pas seulement masqué dans le menu) : une tentative d'accès direct par
// URL par un compte non-Gérant tombe sur ce message, jamais sur le contenu.
export default async function GestionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || !isGerant(session.user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="bg-cream-50 rounded-2xl border border-navy-100 p-8 flex flex-col items-center text-center gap-2 max-w-md">
          <ShieldAlert size={28} className="text-navy-400" />
          <p className="font-semibold text-navy-900">Accès réservé au Gérant</p>
          <p className="text-sm text-navy-600">La plateforme de gestion n&apos;est visible que du compte Gérant.</p>
          <Link href="/" className="text-sm text-sunset-600 hover:underline mt-2">
            Retour à l&apos;application
          </Link>
        </div>
      </div>
    );
  }

  return <GestionShell>{children}</GestionShell>;
}
