// Service worker minimal : sert uniquement à satisfaire les critères
// d'installation (Chrome/Android) et de base pour de futures notifications
// push. Volontairement AUCUNE interception de fetch/cache de pages ou
// d'appels API : les disponibilités, réservations et plannings doivent
// toujours venir du réseau — jamais d'une version mise en cache qui
// pourrait afficher des données de vol périmées.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
