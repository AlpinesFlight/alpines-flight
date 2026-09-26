import { z } from "zod";

// Date de l'opération saisie ("YYYY-MM-DD" ou ISO) sur un mouvement du compte
// pilote : date du virement pour un versement, de l'écriture pour un
// ajustement (voir AccountTransaction.date). Jamais dans le futur — avec 24 h de
// marge, car selon le fuseau "aujourd'hui" peut déjà être demain en UTC.
export const operationDateSchema = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Date invalide.")
  .refine((s) => new Date(s).getTime() <= Date.now() + 86_400_000, "La date ne peut pas être dans le futur.");
