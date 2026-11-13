// Justificatif d'un mouvement du compte pilote (facture de l'aéroport d'une
// taxe d'atterrissage) — constantes partagées par le navigateur (upload
// direct vers Vercel Blob) et les routes. Rien ici ne dépend de Node.

export const TRANSACTION_ATTACHMENT_PREFIX = "transaction-attachments/";

// Une facture : PDF, ou photo/scan.
export const TRANSACTION_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

export const TRANSACTION_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*";

export function transactionAttachmentUrl(transactionId: string): string {
  return `/api/transactions/${transactionId}/attachment`;
}
