"use client";

import { useMemo, useState } from "react";
import { GestionPageHeader } from "@/components/GestionShell";
import { Video, Copy, Check, RefreshCw, Info } from "lucide-react";

// Salle fixe et mémorisable, toujours la même — pratique pour un appel
// récurrent (ex. le père de Tom, un instructeur...) sans avoir à repartager
// un lien à chaque fois.
const FIXED_ROOM = "AlpinesFlight-BureauGerant";

function randomRoom() {
  return `AlpinesFlight-${Math.random().toString(36).slice(2, 8)}`;
}

function roomUrl(room: string) {
  return `https://meet.jit.si/${room}`;
}

export function GestionVisioView() {
  const [privateRoom, setPrivateRoom] = useState(() => randomRoom());
  const [copied, setCopied] = useState<string | null>(null);

  async function copyLink(room: string) {
    try {
      await navigator.clipboard.writeText(roomUrl(room));
      setCopied(room);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Best-effort : si le presse-papiers est refusé (permission, contexte
      // non sécurisé...), le lien reste consultable directement dans le
      // champ affiché — rien de plus à faire côté code.
    }
  }

  return (
    <div>
      <GestionPageHeader title="Visio" subtitle="Appel vidéo via Jitsi Meet, sans compte" />
      <div className="px-4 md:px-10 pb-10 flex flex-col gap-5">
        <RoomCard
          title="Salle habituelle"
          description="Toujours la même adresse — pratique pour un appel récurrent, partage le lien une fois pour toutes."
          room={FIXED_ROOM}
          onCopy={() => copyLink(FIXED_ROOM)}
          copied={copied === FIXED_ROOM}
        />
        <RoomCard
          title="Nouvelle salle privée"
          description="Une adresse unique à usage ponctuel, pour un appel confidentiel."
          room={privateRoom}
          onCopy={() => copyLink(privateRoom)}
          copied={copied === privateRoom}
          onRegenerate={() => setPrivateRoom(randomRoom())}
        />
        <p className="flex items-start gap-1.5 text-xs text-navy-100/40 max-w-xl">
          <Info size={13} className="shrink-0 mt-0.5" />
          Gratuit, sans compte — chaque participant ouvre simplement le lien dans son navigateur. Jitsi limite
          désormais à 5 minutes tout appel intégré dans une page tierce (leur politique, pas la nôtre) : le lien
          s&apos;ouvre donc toujours dans un nouvel onglet, sans cette limite.
        </p>
      </div>
    </div>
  );
}

function RoomCard({
  title,
  description,
  room,
  onCopy,
  copied,
  onRegenerate,
}: {
  title: string;
  description: string;
  room: string;
  onCopy: () => void;
  copied: boolean;
  onRegenerate?: () => void;
}) {
  const url = useMemo(() => roomUrl(room), [room]);
  return (
    <div className="bg-navy-900 rounded-2xl border border-navy-700 p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-cream-50">{title}</h2>
        <p className="text-sm text-navy-100/50 mt-0.5">{description}</p>
      </div>
      <p className="text-xs text-navy-100/70 bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 truncate font-mono">{url}</p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Video size={16} /> Démarrer
        </a>
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-navy-100 text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
          {copied ? "Copié" : "Copier le lien"}
        </button>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            title="Générer une nouvelle salle"
            className="flex items-center gap-1.5 rounded-lg text-navy-100/50 hover:text-cream-50 text-sm px-2 py-2 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
