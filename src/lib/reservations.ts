// Types de vol qui exigent la présence physique de l'instructeur à bord —
// utilisé pour le conflit d'agenda instructeur (POST et PATCH réservations).
// SOLO en est volontairement exclu : l'élève vole seul, l'instructeur qui le
// supervise reste disponible ailleurs (y compris sur un vol d'instruction)
// en même temps.
export const OCCUPYING_RESERVATION_TYPES = ["INSTRUCTION", "DISCOVERY"] as const;
