import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alpines Flight",
    short_name: "Alpines Flight",
    description:
      "École de pilotage / Location d'avion — planning, élèves, flotte et facturation.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c2448",
    theme_color: "#0c2448",
    lang: "fr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
