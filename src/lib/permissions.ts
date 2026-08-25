// Point de vérité unique pour les règles d'accès par rôle — à utiliser
// partout plutôt que de comparer `role` directement dans chaque route, pour
// ne jamais désynchroniser une règle entre deux endroits du code.
//
// Hiérarchie :
//   GERANT      tous droits, sans exception (y compris finances)
//   ADMIN       gestion courante de l'école — élèves, instructeurs, flotte,
//               formation, licences, actualités, documentation, vols
//               découverte — mais AUCUN accès à ce qui touche l'argent
//   INSTRUCTOR  réserver/annuler des vols, remplir les fiches de
//               progression (livret), consulter les documents FI
//   STUDENT     réserver/annuler ses propres vols, déclarer un versement
//               sur son compte pilote, gérer ses propres licences
//               (le champ `isPilot` sur StudentProfile est un simple
//               libellé d'affichage à l'intérieur de ce même rôle STUDENT,
//               voir alpines-flight-app memory — pas un rôle système à part)

export type AppRole = "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";

// Gestion courante de l'école (élèves, flotte, formation, licences,
// actualités, documentation, vols découverte) — tout sauf les finances.
// Nom volontairement différent de la variable locale `isStaff` déjà
// utilisée dans plusieurs fichiers existants pour "ADMIN ou INSTRUCTOR"
// (un concept différent, voir isInstructorOrAbove) — pour ne jamais
// confondre les deux en les import/mélangeant dans un même fichier.
export function canManageSchool(role: string | undefined | null): boolean {
  return role === "GERANT" || role === "ADMIN";
}

// Argent : compte pilote (versements, mouvements, IBAN, export comptable),
// et toute correction financière sur un vol déjà clôturé (modifier/
// supprimer un vol touche directement le solde du pilote). Gérant
// uniquement — l'Admin n'y a explicitement pas accès.
export function canManageFinance(role: string | undefined | null): boolean {
  return role === "GERANT";
}

// FI et au-dessus (staff qui instruit ou gère l'école).
export function isInstructorOrAbove(role: string | undefined | null): boolean {
  return role === "GERANT" || role === "ADMIN" || role === "INSTRUCTOR";
}

export function isGerant(role: string | undefined | null): boolean {
  return role === "GERANT";
}
