import type { ZodError } from "zod";

// Convertit une erreur zod en un seul message clair, plutôt que l'objet
// brut de error.flatten() (fieldErrors/formErrors) — une fois affiché tel
// quel côté client (voir apiFetch dans src/lib/api.ts, qui JSON.stringify
// tout ce qui n'est pas déjà une chaîne), ça ne donnait rien de lisible,
// ex. "8 caractères minimum" devenait
// {"formErrors":[],"fieldErrors":{"newPassword":["8 caractères minimum"]}}.
// Prend le premier message de champ (celui qu'on a pris soin d'écrire
// dans chaque schéma zod), à défaut le premier message de formulaire, à
// défaut un message générique.
export function zodErrorMessage(error: ZodError): string {
  const { fieldErrors, formErrors } = error.flatten();
  const messageLists: (string[] | undefined)[] = Object.values(fieldErrors);
  const firstFieldError = messageLists.find((msgs) => msgs && msgs.length > 0)?.[0];
  return firstFieldError ?? formErrors[0] ?? "Données invalides.";
}
