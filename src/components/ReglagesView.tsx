"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { SchoolSettings } from "@/types/models";
import { ShieldAlert, BellRing, PlaneTakeoff, Ban, Clock3 } from "lucide-react";

export function ReglagesView() {
  const { data: session, status: sessionStatus } = useSession();
  const canManage = session?.user?.role === "GERANT" || session?.user?.role === "ADMIN";
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !canManage) return;
    apiFetch<SchoolSettings>("/api/settings")
      .then(setSettings)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, canManage]);

  async function toggle(field: "notifyOnReservationCreated" | "notifyOnReservationCancelled" | "notifyReminderEnabled") {
    if (!settings) return;
    const next = { [field]: !settings[field] };
    setSaving(true);
    setError(null);
    try {
      const fresh = await apiFetch<SchoolSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setSettings(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  if (sessionStatus === "loading" || loading) {
    return <div className="p-8 text-navy-600 text-sm">Chargement...</div>;
  }

  if (!canManage) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-white rounded-2xl border border-navy-100 p-8 flex flex-col items-center text-center gap-2 max-w-md mx-auto mt-8">
          <ShieldAlert size={28} className="text-navy-400" />
          <p className="font-semibold text-navy-900">Accès réservé à l&apos;Admin et au Gérant</p>
          <p className="text-sm text-navy-600">
            Les réglages de notification ne sont pas visibles des autres comptes.
          </p>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="p-8 max-w-xl">
      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-navy-100">
          <BellRing size={16} className="text-sunset-600" />
          <h2 className="font-semibold text-navy-900">Notifications par email</h2>
        </div>
        <div className="divide-y divide-navy-100">
          <ToggleRow
            icon={PlaneTakeoff}
            label="Confirmation de réservation"
            desc="Email envoyé à l'élève et à l'instructeur concernés dès qu'un vol est réservé."
            checked={settings.notifyOnReservationCreated}
            onChange={() => toggle("notifyOnReservationCreated")}
            disabled={saving}
          />
          <ToggleRow
            icon={Ban}
            label="Annulation de réservation"
            desc="Email envoyé aux mêmes personnes si le vol est annulé."
            checked={settings.notifyOnReservationCancelled}
            onChange={() => toggle("notifyOnReservationCancelled")}
            disabled={saving}
          />
          <ToggleRow
            icon={Clock3}
            label="Rappel la veille au soir"
            desc="Email de rappel envoyé une fois par jour pour les vols du lendemain."
            checked={settings.notifyReminderEnabled}
            onChange={() => toggle("notifyReminderEnabled")}
            disabled={saving}
          />
        </div>
      </div>
      {error && (
        <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2 mt-4">{error}</p>
      )}
      <p className="text-xs text-navy-500 mt-4">
        Les emails de bienvenue (nouvel élève) et de notification de document ne sont pas
        concernés par ces réglages — ils sont toujours envoyés.
      </p>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-9 h-9 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-navy-900">{label}</p>
        <p className="text-xs text-navy-500">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${
          checked ? "bg-sunset-500" : "bg-navy-100"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
