// Constantes/aides partagées par toutes les routes d'upload direct vers
// Vercel Blob (voir chaque .../blob-upload/route.ts) — l'upload va
// directement du navigateur au stockage, ce qui contourne la limite dure de
// 4,5 Mo sur le corps d'une requête serverless. Importé aussi bien côté
// serveur (routes) que client (composants) : rien ici ne dépend de Node.
//
// 500 Mo par fichier : très généreux pour tout document/photo réel de
// l'école (manuel, procédure scannée, photo, courte vidéo...), tout en
// restant un garde-fou contre un fichier choisi par erreur. Le plafond
// technique réel de Vercel Blob est de 5 To par fichier (voir le SDK
// @vercel/blob) — bien au-delà de ce dont cette appli a besoin ; la place
// disponible dépend ensuite du plan Vercel (stockage inclus, puis facturé
// au-delà).
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

// Vérifie que le pathname demandé par le client correspond bien au dossier
// attendu pour ce type de document — garde le store Blob rangé et évite
// qu'un jeton d'upload soit émis pour un chemin arbitraire. À appeler dans
// chaque onBeforeGenerateToken.
export function assertPathnamePrefix(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) {
    throw new Error("Chemin de fichier invalide.");
  }
}
