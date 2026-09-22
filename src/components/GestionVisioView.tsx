"use client";

import { useMemo, useState } from "react";
import { GestionPageHeader } from "@/components/GestionShell";
import { Video, Copy, Check, ExternalLink, RefreshCw, X } from "lucide-react";

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
  const [embedded, setEmbedded] = useState<string | null>(null);
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
      <GestionPageHeader title="Visio" subtitle="Appel vidéo intégré, sans compte ni logiciel à installer" />
      <div className="px-4 md:px-10 pb-10 flex flex-col gap-5">
        {embedded ? (
          <div className="bg-navy-900 rounded-2xl border border-navy-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-navy-700">
              <p className="text-sm font-medium text-cream-50 flex items-center gap-2">
                <Video size={16} className="text-sunset-500" /> {embedded}
              </p>
              <button onClick={() => setEmbedded(null)} className="text-navy-100/50 hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            {/* Jitsi Meet s'intègre sans SDK ni compte : l'URL publique
                meet.jit.si fonctionne directement en iframe (contrairement à
                Google Meet, qui bloque l'intégration en iframe tierce). */}
            <iframe
              src={roomUrl(embedded)}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="w-full h-[70vh] border-0"
            />
          </div>
        ) : (
          <>
            <RoomCard
              title="Salle habituelle"
              description="Toujours la même adresse — pratique pour un appel récurrent, partage le lien une fois pour toutes."
              room={FIXED_ROOM}
              onStart={() => setEmbedded(FIXED_ROOM)}
              onCopy={() => copyLink(FIXED_ROOM)}
              copied={copied === FIXED_ROOM}
            />
            <RoomCard
              title="Nouvelle salle privée"
              description="Une adresse unique à usage ponctuel, pour un appel confidentiel."
              room={privateRoom}
              onStart={() => setEmbedded(privateRoom)}
              onCopy={() => copyLink(privateRoom)}
              copied={copied === privateRoom}
              onRegenerate={() => setPrivateRoom(randomRoom())}
            />
            <p className="text-xs text-navy-100/40 max-w-xl">
              Visio via Jitsi Meet — gratuit, sans compte, fonctionne directement dans le navigateur (chaque
              participant ouvre simplement le lien).
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function RoomCard({
  title,
  description,
  room,
  onStart,
  onCopy,
  copied,
  onRegenerate,
}: {
  title: string;
  description: string;
  room: string;
  onStart: () => void;
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
        <button
          onClick={onStart}
          className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <Video size={16} /> Démarrer ici
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-navy-100 text-sm font-semibold px-3.5 py-2 transition-colors"
        >
          <ExternalLink size={15} /> Nouvel onglet
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
