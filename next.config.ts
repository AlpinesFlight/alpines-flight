import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Jamais de cache sur le service worker lui-même, sinon un
        // navigateur pourrait rester bloqué sur une ancienne version et ne
        // jamais récupérer les mises à jour.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
