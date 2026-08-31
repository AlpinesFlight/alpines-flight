// Champs "sûrs" d'un User à renvoyer au client — exclut systématiquement
// passwordHash. À utiliser partout où un User (ou une relation vers un User)
// est renvoyé par une route API, que ce soit le modèle principal (select)
// ou une relation imbriquée (student: { select: safeUserSelect }, etc.).
export const safeUserSelect = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Champs d'un Aircraft à renvoyer au client — exclut systématiquement
// photoData (le binaire de la photo ne doit transiter que par la route de
// streaming dédiée /api/aircraft/[id]/photo, jamais dans une réponse JSON).
// photoMimeType (null/non-null) suffit côté client pour savoir si une photo
// existe. À utiliser pour tout select/update d'Aircraft renvoyé au client.
export const safeAircraftSelect = {
  id: true,
  registration: true,
  type: true,
  hourlyRateCents: true,
  status: true,
  totalHours: true,
  totalCycles: true,
  color: true,
  notes: true,
  photoMimeType: true,
  photoFileName: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Le `student` d'une Reservation — safeUserSelect, plus juste ce qu'il faut
// du StudentProfile pour que le formulaire de clôture de vol sache si ce
// pilote est autorisé à voler en vol baptême sans être débité (voir
// StudentProfile.canGiveBaptism, ReservationModal.tsx CompleteFlightPanel).
export const safeReservationStudentSelect = {
  ...safeUserSelect,
  studentProfile: { select: { canGiveBaptism: true } },
} as const;

// Champs d'un QualificationDocument à renvoyer au client — exclut
// systématiquement fileData (le contenu binaire, potentiellement volumineux,
// ne doit transiter que par la route de streaming dédiée
// /api/qualifications/documents/[id]/file, jamais dans une réponse JSON).
// À utiliser partout où un document est select/update-select-retourné.
export const safeDocumentSelect = {
  id: true,
  qualificationId: true,
  number: true,
  issuedAt: true,
  expiresAt: true,
  notes: true,
  fileName: true,
  fileMimeType: true,
  fileSize: true,
  status: true,
  rejectionReason: true,
  uploadedAt: true,
  uploadedById: true,
  uploadedBy: { select: safeUserSelect },
  validatedAt: true,
  validatedById: true,
  validatedBy: { select: safeUserSelect },
} as const;

// Champs d'une AnnouncementAttachment à renvoyer au client — exclut
// systématiquement fileData, voir même logique que safeDocumentSelect. Le
// fichier ne transite que par
// /api/announcements/[id]/attachments/[attachmentId].
export const safeAnnouncementAttachmentSelect = {
  id: true,
  announcementId: true,
  fileName: true,
  fileMimeType: true,
  fileSize: true,
  uploadedAt: true,
} as const;

// Champs d'un SchoolDocument (page Documentation) à renvoyer au client —
// exclut systématiquement fileData, même logique que safeDocumentSelect. Le
// fichier ne transite que par /api/documents/[id]/file, qui réapplique aussi
// la règle de visibilité (ALL vs FI_ONLY) avant de servir le binaire.
export const safeSchoolDocumentSelect = {
  id: true,
  title: true,
  category: true,
  visibility: true,
  fileName: true,
  fileMimeType: true,
  fileSize: true,
  uploadedAt: true,
  uploadedById: true,
  uploadedBy: { select: safeUserSelect },
} as const;
