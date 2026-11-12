import { CloudSun, ExternalLink } from "lucide-react";

// Météo de Tallard (05130) sur le tableau de bord : widget gratuit "prévisions
// jour" de meteoblue (gratuit y compris pour un usage commercial, d'après leur
// configurateur). Emplacement meteoblue du village : tallard_france_2973485
// (44,462 N / 6,052 E, 608 m — trouvé par la recherche meteoblue ; l'aérodrome
// LFNA a sa propre fiche, gap–tallard-airport_france_6694627).
//
// meteoblue demande de garder le lien vers son site avec le widget et de ne
// pas retoucher l'adresse ("src") produite par son configurateur. Celui-ci
// exige désormais un compte meteoblue pour afficher le code : l'adresse
// ci-dessous suit le format standard de ce widget, vérifiée en ligne
// (2026-11-12). Vent en nœuds (windunit=KNOT), l'unité des pilotes. Avec un compte, il suffit de remplacer WIDGET_SRC par celle
// que donne le configurateur (https://www.meteoblue.com/fr/meteo/widget/setupday/tallard_france_2973485).
const LOCATION = "tallard_france_2973485";

const WIDGET_SRC =
  `https://www.meteoblue.com/fr/meteo/widget/daily/${LOCATION}` +
  "?geoloc=fixed&days=5&tempunit=CELSIUS&windunit=KNOT&precipunit=MILLIMETER" +
  "&coloured=coloured&pictoicon=0&pictoicon=1&maxtemperature=0&maxtemperature=1" +
  "&mintemperature=0&mintemperature=1&windspeed=0&windspeed=1&windgust=0&windgust=1" +
  "&winddirection=0&winddirection=1&uv=0&humidity=0&precipitation=0&precipitation=1" +
  "&precipitationprobability=0&precipitationprobability=1&spot=0&pressure=0&layout=light";

const WEEK_URL =
  `https://www.meteoblue.com/fr/meteo/semaine/${LOCATION}` +
  "?utm_source=daily_widget&utm_medium=linkus&utm_content=daily&utm_campaign=Weather%2BWidget";

export function WeatherCard() {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-navy-100">
        <h2 className="flex items-center gap-2 font-semibold text-navy-900">
          <CloudSun size={17} className="text-sunset-600" /> Météo à Tallard
        </h2>
        <a
          href={WEEK_URL}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 text-sm text-sunset-600 hover:underline"
        >
          Prévisions détaillées <ExternalLink size={13} />
        </a>
      </div>
      <div className="px-3 pt-3 flex-1">
        <iframe
          src={WIDGET_SRC}
          title="Prévisions météo meteoblue pour Tallard"
          scrolling="no"
          sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
          // Hauteur mesurée : 5 jours avec pictogramme, températures, vent
          // (nœuds, rafales, direction) et pluie tiennent en ~355 px.
          className="block w-full border-0"
          style={{ height: 360 }}
        />
      </div>
      {/* Lien vers meteoblue : à conserver (conditions d'utilisation du widget). */}
      <p className="px-5 pb-3 pt-1 text-[11px] text-navy-400">
        Source :{" "}
        <a href={WEEK_URL} target="_blank" rel="noopener" className="hover:underline">
          meteoblue
        </a>
      </p>
    </div>
  );
}
