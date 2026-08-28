"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Users,
  UserCog,
  Plane,
  PlaneTakeoff,
  Wallet,
  GraduationCap,
  ShieldCheck,
  LayoutDashboard,
  KeyRound,
  Compass,
  BookOpen,
  Download,
  LogOut,
  Lock,
  X,
  Settings,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { clsx } from "clsx";
import { apiFetch } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/planning", label: "Planning", icon: CalendarDays },
  // Gestion interne des vols découverte/baptême — pas de réservation
  // publique (voir la page), donc réservé au staff pédagogique comme le
  // reste de la gestion des vols.
  { href: "/decouverte", label: "Vol découverte", icon: Compass, staffOnly: true },
  { href: "/eleves", label: "Élèves", icon: Users },
  { href: "/instructeurs", label: "Instructeurs", icon: UserCog },
  { href: "/formation", label: "Formation", icon: GraduationCap },
  { href: "/licences", label: "Licences", icon: ShieldCheck },
  { href: "/flotte", label: "Flotte", icon: Plane },
  { href: "/vols", label: "Vols", icon: PlaneTakeoff },
  { href: "/comptes-pilotes", label: "Comptes pilotes", icon: Wallet },
  // Visible de tous — chacun n'y voit que les documents que sa visibilité
  // autorise (voir /api/documents).
  { href: "/documentation", label: "Documentation", icon: BookOpen },
  // Réglages de notification — gestion courante, pas une question
  // financière : Admin et Gérant, voir schoolManagerOnly dans le filtre.
  { href: "/reglages", label: "Réglages", icon: Settings, schoolManagerOnly: true },
  // Gestion des rôles/droits d'accès — donnée sensible, visible uniquement
  // du Gérant (voir le filtre plus bas), contrairement aux autres liens qui
  // restent affichés à tous et se gèrent au niveau du contenu de la page.
  { href: "/comptes", label: "Comptes & droits", icon: KeyRound, gerantOnly: true },
];

export function Sidebar({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <aside className="w-64 shrink-0 bg-navy-800 text-cream-50 flex flex-col min-h-screen">
      {/* Fond crème dédié : le badge du logo est lui-même navy (couleur
          quasi identique à bg-navy-800 du reste de la barre), il devenait
          invisible posé directement dessus. Le crème tranche nettement et
          reprend une des couleurs du logo (le lettrage). */}
      {/* min-h-[105px] : même hauteur totale (bordure comprise, box-sizing
          border-box) que le bandeau crème du PageHeader (voir
          PageHeader.tsx — titre + sous-titre y montent naturellement à
          105px), pour que la limite entre bande claire et reste de la page
          tombe exactement au même niveau à gauche et sur le contenu
          principal. */}
      <div className="flex items-center gap-3 px-5 py-6 min-h-[105px] bg-cream-50 border-b border-navy-100">
        <Image
          src="/brand/logo-mark.png"
          alt="Alpines Flight"
          width={52}
          height={52}
          className="rounded-full shrink-0"
        />
        <div>
          <p className="font-[family-name:var(--font-display)] font-bold text-lg leading-tight text-navy-900">
            Alpines Flight
          </p>
          <p className="text-xs text-navy-600">École de pilotage</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV_ITEMS.filter(
          (item) =>
            (!item.gerantOnly || userRole === "GERANT") &&
            (!item.staffOnly || userRole === "GERANT" || userRole === "ADMIN" || userRole === "INSTRUCTOR") &&
            (!item.schoolManagerOnly || userRole === "GERANT" || userRole === "ADMIN")
        ).map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-sunset-500 text-white"
                  : "text-navy-100 hover:bg-navy-700 hover:text-cream-50"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-navy-700">
        <p className="text-sm font-medium truncate">{userName}</p>
        <p className="text-[11px] text-navy-100 mb-3">{roleLabel(userRole)}</p>
        {/* Droit d'accès/portabilité RGPD : chaque compte peut exporter ses
            propres données en un clic — voir /api/me/export et
            /confidentialite. */}
        <a
          href="/api/me/export"
          className="flex items-center gap-2 text-xs text-navy-100 hover:text-sunset-500 transition-colors mb-2"
        >
          <Download size={14} />
          Exporter mes données
        </a>
        <button
          onClick={() => setShowPassword(true)}
          className="flex items-center gap-2 text-xs text-navy-100 hover:text-sunset-500 transition-colors mb-2"
        >
          <Lock size={14} />
          Changer mon mot de passe
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-xs text-navy-100 hover:text-sunset-500 transition-colors"
        >
          <LogOut size={14} />
          Déconnexion
        </button>
      </div>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </aside>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl text-navy-900">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Changer mon mot de passe</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        {success ? (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-green-700 bg-green-100 rounded-lg px-3 py-2">
              Mot de passe changé avec succès.
            </p>
            <button
              onClick={onClose}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Mot de passe actuel</span>
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Nouveau mot de passe</span>
              <input
                required
                minLength={8}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Confirmer le nouveau mot de passe</span>
              <input
                required
                minLength={8}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input"
              />
            </label>
            {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Changer le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function roleLabel(role: string) {
  switch (role) {
    case "GERANT":
      return "Gérant";
    case "ADMIN":
      return "Administrateur";
    case "INSTRUCTOR":
      return "Instructeur";
    case "STUDENT":
      return "Élève";
    default:
      return role;
  }
}
