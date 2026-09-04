export type Role = "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";

export interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  phone?: string | null;
  instructorProfile?: {
    color: string;
    qualifications: string | null;
    hourlyRateCents: number | null;
  } | null;
  studentProfile?: {
    licenseType: string | null;
    licenseNumber: string | null;
    totalHours: number;
    balanceCents: number;
    medicalExpiry: string | null;
    notes: string | null;
    isPilot: boolean;
    canGiveBaptism?: boolean;
    soloGrassCleared?: boolean;
    soloPavedCleared?: boolean;
  } | null;
}

export type AircraftStatus = "AVAILABLE" | "MAINTENANCE" | "GROUNDED" | "RETIRED";

export interface Aircraft {
  id: string;
  registration: string;
  type: string;
  hourlyRateCents: number;
  status: AircraftStatus;
  totalHours: number;
  totalCycles: number;
  color: string;
  notes: string | null;
  // Jamais le binaire (photoData) — voir /api/aircraft/[id]/photo pour le
  // streaming. photoMimeType non-null = une photo existe.
  photoMimeType: string | null;
  photoFileName: string | null;
  maintenanceRecords?: MaintenanceRecord[];
  kardexEntries?: KardexEntry[];
}

export type MaintenanceType = "HOURLY" | "CALENDAR" | "CYCLES";
export type MaintenanceStatus = "UPCOMING" | "DUE" | "OVERDUE" | "DONE";

export interface MaintenanceRecord {
  id: string;
  aircraftId: string;
  aircraft?: Aircraft;
  label: string;
  type: MaintenanceType;
  dueAtHours: number | null;
  dueAtDate: string | null;
  dueAtCycles: number | null;
  alertBefore: number;
  status: MaintenanceStatus;
  completedAt: string | null;
  notes: string | null;
}

export type MaintenanceIssueStatus = "OPEN" | "RESOLVED";

export interface MaintenanceIssue {
  id: string;
  aircraftId: string;
  aircraft: Aircraft;
  description: string;
  status: MaintenanceIssueStatus;
  createdAt: string;
  reportedById: string;
  reportedBy: UserLite;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedBy: UserLite | null;
  resolutionNotes: string | null;
}

export type KardexCategory =
  | "VISITE"
  | "REPARATION"
  | "CONSIGNE_NAVIGABILITE"
  | "PIECE_REMPLACEE"
  | "AUTRE";

export interface KardexEntry {
  id: string;
  aircraftId: string;
  aircraft?: Aircraft;
  date: string;
  hoursAt: number | null;
  cyclesAt: number | null;
  category: KardexCategory;
  title: string;
  description: string | null;
  performedBy: string | null;
  reference: string | null;
  maintenanceRecordId: string | null;
  maintenanceRecord?: MaintenanceRecord | null;
  createdAt: string;
  createdById: string | null;
  createdBy?: UserLite | null;
}

export type ReservationType = "INSTRUCTION" | "SOLO" | "LOCATION" | "MAINTENANCE" | "DISCOVERY";
export type ReservationStatus = "CONFIRMED" | "IN_FLIGHT" | "CANCELLED" | "COMPLETED";

export interface Reservation {
  id: string;
  aircraftId: string;
  aircraft: Aircraft;
  studentId: string | null;
  student: UserLite | null;
  instructorId: string | null;
  instructor: UserLite | null;
  trainingProgramId: string | null;
  trainingProgram?: TrainingProgramLite | null;
  type: ReservationType;
  status: ReservationStatus;
  startTime: string;
  endTime: string;
  actualDepartureTime: string | null;
  notes: string | null;
  // Vol découverte/baptême (type DISCOVERY) uniquement — voir
  // /api/reservations/[id]/complete.
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  priceCents: number | null;
  isBaptism: boolean;
}

export interface InstructorAvailability {
  id: string;
  instructorId: string;
  instructor: UserLite;
  startTime: string;
  endTime: string;
  notes: string | null;
}

// ---------- Carnet de vol ----------

export interface FlightStop {
  id: string;
  airfield: string;
  touchAndGo: number;
}

export type FuelCard = "BP" | "TOTAL" | "BADGE_TALLARD";
export type FuelType = "AVGAS_100LL" | "SP98";

export interface FlightLog {
  id: string;
  reservationId: string | null;
  aircraftId: string;
  aircraft: Aircraft;
  studentId: string | null;
  student?: UserLite | null;
  instructorId: string | null;
  instructor?: UserLite | null;
  trainingProgramId: string | null;
  trainingProgram?: TrainingProgramLite | null;
  date: string;
  departureTime: string;
  arrivalTime: string;
  departureAirfield: string | null;
  arrivalAirfield: string | null;
  duration: number;
  totalLandings: number;
  aircraftCostCents: number;
  instructionCostCents: number;
  isBaptism: boolean;
  remarks: string | null;
  stops: FlightStop[];
  fuelRefillDone: boolean;
  fuelCard: FuelCard | null;
  fuelLiters: number | null;
  fuelType: FuelType | null;
  fuelAirfield: string | null;
}

// ---------- Compte pilote ----------

export interface SchoolSettings {
  ibanHolder: string | null;
  iban: string | null;
  bic: string | null;
  bankName: string | null;
  notes: string | null;
  notifyOnReservationCreated: boolean;
  notifyOnReservationUpdated: boolean;
  notifyOnReservationCancelled: boolean;
  notifyReminderEnabled: boolean;
  updatedAt: string | null;
  updatedBy?: UserLite | null;
}

// ---------- Actualités (tableau de bord) ----------

export interface AnnouncementAttachment {
  id: string;
  announcementId: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserLite;
  attachments: AnnouncementAttachment[];
}

export type DocumentVisibility = "ALL" | "FI_ONLY";

export interface SchoolDocument {
  id: string;
  title: string;
  category: string | null;
  visibility: DocumentVisibility;
  archived: boolean;
  fileName: string;
  fileMimeType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedById: string;
  uploadedBy: UserLite;
  // Date à laquelle L'UTILISATEUR COURANT a confirmé avoir lu ce document,
  // null s'il ne l'a pas encore fait — voir /api/documents/[id]/acknowledge.
  myAcknowledgedAt: string | null;
}

export interface DocumentAcknowledgment {
  user: UserLite;
  notifiedAt: string;
  acknowledgedAt: string | null;
}

export type TransactionType = "DEPOSIT" | "FLIGHT_DEBIT" | "ADJUSTMENT";
export type TransactionStatus = "PENDING" | "CONFIRMED" | "REJECTED";
export type PaymentMethod = "CARD" | "TRANSFER" | "CASH" | "CHECK";

export interface AccountTransaction {
  id: string;
  studentId: string;
  student: UserLite;
  type: TransactionType;
  status: TransactionStatus;
  amountCents: number;
  method: PaymentMethod | null;
  reference: string | null;
  flightLogId: string | null;
  flightLog?: {
    id: string;
    duration: number;
    departureTime: string;
    arrivalTime: string;
    aircraft: Aircraft;
  } | null;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  confirmedById: string | null;
  confirmedBy?: UserLite | null;
}

// ---------- Licences, qualifications, médicales ----------

export type QualificationType =
  | "LICENSE"
  | "MEDICAL"
  | "CLASS_RATING"
  | "VARIANT"
  | "ADDITIONAL"
  | "INSTRUCTOR_PRIV"
  | "EXAMINER_PRIV"
  | "OTHER";

export type DocumentStatus = "PENDING" | "VALIDATED" | "REJECTED" | "ARCHIVED";

export interface QualificationDocument {
  id: string;
  qualificationId: string;
  number: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  status: DocumentStatus;
  rejectionReason: string | null;
  uploadedAt: string;
  uploadedById: string | null;
  uploadedBy?: UserLite | null;
  validatedAt: string | null;
  validatedById: string | null;
  validatedBy?: UserLite | null;
}

export interface Qualification {
  id: string;
  userId: string;
  user: UserLite;
  type: QualificationType;
  label: string;
  reminderDaysBefore: number;
  lastReminderSentAt: string | null;
  currentDocumentId: string | null;
  currentDocument: QualificationDocument | null;
  documents: QualificationDocument[];
}

// ---------- Suivi de formation ----------

export type ExerciseType = "SOL" | "DC" | "SOLO" | "TEST" | "DC_SOLO";

export interface TrainingExercise {
  id: string;
  phaseId: string;
  order: number;
  numero: string;
  intitule: string;
  type: ExerciseType;
  objectifs: string[] | null;
  contenu: string[] | null;
  criteresValidation: string | null;
  dureeIndicativeH: number | null;
  bloquantPour: string | null;
  note: string | null;
}

export interface TrainingPhase {
  id: string;
  programId: string;
  code: string;
  order: number;
  title: string;
  objectifGeneral: string | null;
  exercises: TrainingExercise[];
}

export interface TrainingProgram {
  id: string;
  code: string;
  title: string;
  category: string | null;
  modality: string | null;
  referenceReglementaire: string | null;
  sanction: string | null;
  volumeLabel: string | null;
  notationScale: string[] | null;
  active: boolean;
  sourceFile: string | null;
  importedAt: string | null;
  instructionRateCents: number | null;
  phases: TrainingPhase[];
}

// Forme compacte utilisée dans les relations (Reservation.trainingProgram,
// FlightLog.trainingProgram) — pas besoin des phases/exercices ici.
export interface TrainingProgramLite {
  id: string;
  code: string;
  title: string;
  instructionRateCents: number | null;
}

export type EnrollmentStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "SUSPENDED";
export type ProgressLevel = "NON_VU" | "VU" | "ASSIMILE" | "NIVEAU_CIBLE";

export interface ExerciseProgress {
  id: string;
  enrollmentId: string;
  exerciseId: string;
  exercise?: TrainingExercise;
  sessionId: string | null;
  level: ProgressLevel;
  date: string;
  instructorId: string | null;
  instructor?: UserLite | null;
  notes: string | null;
}

export interface TrainingSession {
  id: string;
  enrollmentId: string;
  date: string;
  instructorId: string;
  instructor: UserLite;
  aircraftId: string | null;
  aircraft?: Aircraft | null;
  flightLogId: string | null;
  flightLog?: FlightLog | null;
  remarks: string | null;
  updatedAt: string;
  progress: ExerciseProgress[];
}

export interface Enrollment {
  id: string;
  studentId: string;
  student: UserLite;
  programId: string;
  program: TrainingProgram;
  instructorId: string | null;
  instructor: UserLite | null;
  status: EnrollmentStatus;
  startedAt: string;
  completedAt: string | null;
  targetExamDate: string | null;
  notes: string | null;
  progress: ExerciseProgress[];
  sessions?: TrainingSession[];
}
