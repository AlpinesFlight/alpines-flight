import { del, head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { TRANSACTION_ATTACHMENT_PREFIX } from "@/lib/transaction-attachments";

// Côté serveur uniquement. Vérifie qu'un fichier que le navigateur dit avoir
// envoyé existe bien dans le store, dans le dossier des justificatifs, et
// renvoie sa taille et son type réels — jamais ceux annoncés par le client.
// null = introuvable, hors du dossier attendu, ou déjà le justificatif d'un
// autre mouvement (le supprimer avec l'un l'effacerait pour l'autre).
export async function verifyTransactionAttachment(blobUrl: string, fileName: string) {
  try {
    const [meta, alreadyUsed] = await Promise.all([
      head(blobUrl),
      prisma.accountTransactionAttachment.findFirst({ where: { blobUrl }, select: { id: true } }),
    ]);
    if (alreadyUsed || !meta.pathname.startsWith(TRANSACTION_ATTACHMENT_PREFIX)) return null;
    return {
      fileName: fileName.trim().slice(0, 200) || "justificatif",
      fileMimeType: meta.contentType || "application/octet-stream",
      fileSize: meta.size,
      blobUrl,
    };
  } catch {
    return null;
  }
}

// Suppression best-effort d'un fichier devenu inutile, toujours APRÈS
// l'écriture en base (on ne perd jamais le pointeur vers un fichier encore
// référencé si la base échoue).
export async function deleteBlobQuietly(blobUrl: string | null | undefined, context: string) {
  if (!blobUrl) return;
  try {
    await del(blobUrl);
  } catch (err) {
    console.error(`Suppression Blob échouée (${context}) :`, err);
  }
}
