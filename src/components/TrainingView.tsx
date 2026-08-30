"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import {
  Aircraft,
  Enrollment,
  EnrollmentStatus,
  ExerciseProgress,
  FlightLog,
  ProgressLevel,
  TrainingProgram,
  TrainingSession,
  UserLite,
} from "@/types/models";
import { formatDate, formatDateTime, formatHours } from "@/lib/format";
import { canManageSchool, isInstructorOrAbove } from "@/lib/permissions";
import {
  Plus,
  X,
  RefreshCw,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Pencil,
  FileDown,
  Euro,
  Trash2,
} from "lucide-react";
import { clsx } from "clsx";

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  ABANDONED: "Abandonnée",
  SUSPENDED: "Suspendue",
};
const STATUS_STYLE: Record<EnrollmentStatus, string> = {
  IN_PROGRESS: "bg-sunset-100 text-sunset-600",
  COMPLETED: "bg-green-100 text-green-700",
  ABANDONED: "bg-navy-100 text-navy-500",
  SUSPENDED: "bg-red-100 text-red-600",
};

const LEVEL_LABEL: Record<ProgressLevel, string> = {
  NON_VU: "Non vu",
  VU: "Vue",
  ASSIMILE: "Assimilée",
  NIVEAU_CIBLE: "Niveau cible",
};
const LEVEL_STYLE: Record<ProgressLevel, string> = {
  NON_VU: "bg-navy-50 text-navy-400",
  VU: "bg-sunset-100 text-sunset-600",
  ASSIMILE: "bg-green-100 text-green-700",
  NIVEAU_CIBLE: "bg-green-700 text-white",
};

// Déduit, pour chaque exercice, le niveau le plus récent à partir de
// l'historique complet (trié du plus récent au plus ancien).
function latestLevelByExercise(progress: ExerciseProgress[]): Map<string, ExerciseProgress> {
  const map = new Map<string, ExerciseProgress>();
  for (const p of progress) {
    if (!map.has(p.exerciseId)) map.set(p.exerciseId, p);
  }
  return map;
}

function computeSummary(program: TrainingProgram, progress: ExerciseProgress[]) {
  const latest = latestLevelByExercise(progress);
  const allExercises = program.phases.flatMap((ph) => ph.exercises);
  let done = 0;
  let inProgress = 0;
  let todo = 0;
  for (const ex of allExercises) {
    const level = latest.get(ex.id)?.level ?? "NON_VU";
    if (level === "ASSIMILE" || level === "NIVEAU_CIBLE") done++;
    else if (level === "VU") inProgress++;
    else todo++;
  }
  const total = allExercises.length || 1;
  return { done, inProgress, todo, total, pct: Math.round((done / total) * 100) };
}

// Heures de vol par phase (à partir des séances reliées à un vol) + total.
function computeFlightHours(enrollment: Enrollment) {
  const exerciseToPhase = new Map<string, { code: string; title: string }>();
  for (const phase of enrollment.program.phases) {
    for (const ex of phase.exercises) exerciseToPhase.set(ex.id, { code: phase.code, title: phase.title });
  }

  const perPhase = new Map<string, { code: string; title: string; hours: number }>();
  let total = 0;
  for (const s of enrollment.sessions ?? []) {
    if (!s.flightLog) continue;
    const firstExerciseId = s.progress[0]?.exerciseId;
    const phase = firstExerciseId ? exerciseToPhase.get(firstExerciseId) : undefined;
    const key = phase?.code ?? "—";
    const label = phase ?? { code: "—", title: "Sans phase identifiée" };
    const current = perPhase.get(key) ?? { ...label, hours: 0 };
    current.hours += s.flightLog.duration;
    perPhase.set(key, current);
    total += s.flightLog.duration;
  }
  return { perPhase: Array.from(perPhase.values()), total };
}

export function TrainingView() {
  const { data: session, status: sessionStatus } = useSession();
  const canManage = canManageSchool(session?.user?.role);
  const isStaff = isInstructorOrAbove(session?.user?.role);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [students, setStudents] = useState<UserLite[]>([]);
  const [instructors, setInstructors] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnroll, setShowEnroll] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [en, pr, st, ins] = await Promise.all([
        apiFetch<Enrollment[]>("/api/enrollments"),
        apiFetch<TrainingProgram[]>("/api/training/programs"),
        isStaff ? apiFetch<UserLite[]>("/api/students") : Promise.resolve([]),
        isStaff ? apiFetch<UserLite[]>("/api/instructors") : Promise.resolve([]),
      ]);
      setEnrollments(en);
      setPrograms(pr);
      setStudents(st);
      setInstructors(ins);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Attend la session résolue : sinon isStaff démarre à false, un premier
    // chargement partiel (sans élèves/instructeurs) part en vol, et rien ne
    // garantit qu'il se termine avant le second déclenché par la mise à
    // jour d'isStaff — le plus lent écraserait l'autre.
    if (sessionStatus === "loading") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, isStaff]);

  async function handleImport() {
    setImporting(true);
    setImportMsg(null);
    try {
      const report = await apiFetch<{
        imported: { title: string }[];
        errors: { file: string; error: string }[];
      }>("/api/training/import", { method: "POST" });
      setImportMsg(
        `${report.imported.length} programme(s) synchronisé(s)` +
          (report.errors.length ? ` — ${report.errors.length} erreur(s)` : "")
      );
      load();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Erreur d'import");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center flex-wrap justify-between mb-5 gap-3">
        <p className="text-sm text-navy-600">
          {programs.length} programme(s) disponible(s)
          {importMsg && <span className="ml-2 text-navy-500">· {importMsg}</span>}
        </p>
        <div className="flex items-center flex-wrap gap-2">
          {canManage && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-navy-800 text-navy-800 hover:bg-navy-50 text-sm font-semibold px-3.5 py-2 transition-colors disabled:opacity-60"
            >
              <RefreshCw size={15} className={importing ? "animate-spin" : ""} />
              {importing ? "Import..." : "Réimporter les programmes"}
            </button>
          )}
          {isStaff && (
            <button
              onClick={() => setShowEnroll(true)}
              className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
            >
              <Plus size={16} /> Nouvelle inscription
            </button>
          )}
        </div>
      </div>

      {canManage && <ProgramsPanel onChanged={load} />}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {enrollments.map((en) => {
          const summary = computeSummary(en.program, en.progress);
          return (
            <button
              key={en.id}
              onClick={() => setDetailId(en.id)}
              className="text-left bg-white rounded-2xl border border-navy-100 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="px-5 py-4 border-b border-navy-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-navy-900">
                    {en.student.firstName} {en.student.lastName}
                  </p>
                  <span className={clsx("text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap", STATUS_STYLE[en.status])}>
                    {STATUS_LABEL[en.status]}
                  </span>
                </div>
                <p className="text-xs text-navy-600 mt-0.5">{en.program.title}</p>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between text-xs text-navy-600 mb-1.5">
                  <span>{summary.done}/{summary.total} exercices acquis</span>
                  <span className="font-semibold text-navy-900">{summary.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-navy-100 overflow-hidden">
                  <div className="h-full bg-sunset-500" style={{ width: `${summary.pct}%` }} />
                </div>
                {en.instructor && (
                  <p className="text-xs text-navy-500 mt-2">
                    Référent : {en.instructor.firstName} {en.instructor.lastName}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {!loading && enrollments.length === 0 && (
          <p className="text-navy-600 text-sm">Aucune inscription pour l&apos;instant.</p>
        )}
      </div>

      {showEnroll && (
        <EnrollModal
          programs={programs}
          students={students}
          instructors={instructors}
          onClose={() => setShowEnroll(false)}
          onCreated={() => {
            setShowEnroll(false);
            load();
          }}
        />
      )}

      {detailId && (
        <EnrollmentDetailModal
          enrollmentId={detailId}
          isStaff={isStaff}
          instructors={instructors}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// Gestion des programmes de formation — admin uniquement : renommer,
// activer/désactiver, fixer le tarif d'instruction (voir ReservationModal /
// /api/reservations/[id]/complete), en créer un nouveau, ou en supprimer un
// (refusé par l'API s'il a déjà servi — proposer de le désactiver à la
// place). Se recharge indépendamment de la grille d'inscriptions ci-dessous
// car elle a besoin de voir aussi les programmes désactivés.
function ProgramsPanel({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    const data = await apiFetch<TrainingProgram[]>("/api/training/programs?all=true");
    setPrograms(data);
    setLoaded(true);
  }

  useEffect(() => {
    if (open && !loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function refresh() {
    load();
    onChanged();
  }

  return (
    <div className="bg-white rounded-2xl border border-navy-100 mb-5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <Euro size={15} /> Programmes de formation — noms, tarifs, actif/inactif
        </span>
        {open ? <ChevronDown size={16} className="text-navy-500" /> : <ChevronRight size={16} className="text-navy-500" />}
      </button>
      {open && (
        <div className="border-t border-navy-100">
          <div className="flex justify-end px-5 py-2.5 border-b border-navy-100">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-sunset-600 hover:underline"
            >
              <Plus size={14} /> Nouveau programme
            </button>
          </div>
          <div className="divide-y divide-navy-100">
            {programs.map((p) => (
              <ProgramRow key={p.id} program={p} onChanged={refresh} />
            ))}
            {loaded && programs.length === 0 && (
              <p className="px-5 py-4 text-sm text-navy-600">Aucun programme disponible.</p>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateProgramModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ProgramRow({ program, onChanged }: { program: TrainingProgram; onChanged: () => void }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(program.title);
  const savedRate = program.instructionRateCents != null ? String(program.instructionRateCents / 100) : "";
  const [rate, setRate] = useState(savedRate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rateDirty = rate !== savedRate;

  async function patch(data: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/training/programs/${program.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function saveTitle() {
    if (title.trim() && title !== program.title) await patch({ title: title.trim() });
    setEditingTitle(false);
  }

  async function saveRate() {
    await patch({ instructionRateCents: rate ? Math.round(parseFloat(rate) * 100) : null });
  }

  async function toggleActive() {
    await patch({ active: !program.active });
  }

  async function handleDelete() {
    if (!window.confirm(`Supprimer définitivement « ${program.title} » ?`)) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/training/programs/${program.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={clsx("px-5 py-2.5 flex flex-col gap-1.5", !program.active && "opacity-50")}>
      <div className="flex items-center gap-3">
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            className="input flex-1 py-1.5 text-sm"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="flex-1 flex items-center gap-1.5 text-sm text-navy-800 text-left hover:text-navy-900 group truncate"
          >
            <span className="truncate">{program.title}</span>
            <Pencil size={12} className="text-navy-300 group-hover:text-navy-500 shrink-0" />
          </button>
        )}
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="tarif instructeur par défaut"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="input w-40 py-1.5 text-sm shrink-0"
        />
        <span className="text-xs text-navy-500 w-6 shrink-0">€/h</span>
        <button
          onClick={saveRate}
          disabled={saving || !rateDirty}
          className="text-xs font-semibold text-sunset-600 hover:underline disabled:opacity-0 disabled:pointer-events-none w-16 text-right shrink-0"
        >
          {saving ? "..." : "OK"}
        </button>
        <button
          onClick={toggleActive}
          disabled={saving}
          className={clsx(
            "text-[11px] font-semibold px-2 py-1 rounded-full shrink-0",
            program.active ? "bg-green-100 text-green-700" : "bg-navy-100 text-navy-500"
          )}
        >
          {program.active ? "Actif" : "Inactif"}
        </button>
        <button
          onClick={handleDelete}
          disabled={saving}
          title="Supprimer"
          className="text-navy-400 hover:text-red-600 shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CreateProgramModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/training/programs", {
        method: "POST",
        body: JSON.stringify({ code, title, category: category || null }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Nouveau programme</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <p className="text-xs text-navy-600 -mt-1">
            Créé sans phases/exercices — utile pour un programme
            &laquo;&nbsp;maison&nbsp;&raquo; (vol découverte,
            familiarisation...) ne suivant pas le format des livrets DTO
            importés.
          </p>
          <input
            required
            placeholder="Nom du programme"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
          <input
            required
            placeholder="Code (ex: AF-VOL-DECOUVERTE)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="input"
          />
          <input
            placeholder="Catégorie (optionnel)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
          />
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Création..." : "Créer le programme"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EnrollModal({
  programs,
  students,
  instructors,
  onClose,
  onCreated,
}: {
  programs: TrainingProgram[];
  students: UserLite[];
  instructors: UserLite[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [instructorId, setInstructorId] = useState("");
  const [targetExamDate, setTargetExamDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/enrollments", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          programId,
          instructorId: instructorId || null,
          targetExamDate: targetExamDate || null,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
          <h2 className="font-semibold text-navy-900">Nouvelle inscription</h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <select required value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input">
            <option value="">Choisir un élève</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
          <select required value={programId} onChange={(e) => setProgramId(e.target.value)} className="input">
            <option value="">Choisir un programme</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Instructeur référent (optionnel)</span>
            <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input">
              <option value="">—</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.firstName} {i.lastName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Date d&apos;épreuve visée (optionnel)</span>
            <input
              type="date"
              value={targetExamDate}
              onChange={(e) => setTargetExamDate(e.target.value)}
              className="input"
            />
          </label>
          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={saving || !studentId || !programId}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Inscription..." : "Inscrire"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EnrollmentDetailModal({
  enrollmentId,
  isStaff,
  instructors,
  onClose,
  onChanged,
}: {
  enrollmentId: string;
  isStaff: boolean;
  instructors: UserLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: session } = useSession();
  const canManage = canManageSchool(session?.user?.role);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [showSession, setShowSession] = useState(false);
  const [editSession, setEditSession] = useState<TrainingSession | null>(null);
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const [tab, setTab] = useState<"exercices" | "seances" | "vol">("exercices");
  const [savingField, setSavingField] = useState(false);
  // Capturé au chargement plutôt que lu pendant le rendu (Date.now() est impur).
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    const data = await apiFetch<Enrollment>(`/api/enrollments/${enrollmentId}`);
    setEnrollment(data);
    setNow(Date.now());
    if (!openPhase && data.program.phases.length > 0) setOpenPhase(data.program.phases[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  const latest = useMemo(
    () => (enrollment ? latestLevelByExercise(enrollment.progress) : new Map<string, ExerciseProgress>()),
    [enrollment]
  );
  const summary = enrollment ? computeSummary(enrollment.program, enrollment.progress) : null;

  // Exercices "en cours depuis un moment" (leçon vue mais pas assimilée
  // depuis plus de 30 jours) — sert de repère pour "où ça bloque".
  const stuck = useMemo(() => {
    if (!enrollment) return [];
    const allExercises = enrollment.program.phases.flatMap((ph) => ph.exercises);
    return allExercises.filter((ex) => {
      const p = latest.get(ex.id);
      if (!p || p.level !== "VU") return false;
      return now - new Date(p.date).getTime() > 30 * 86_400_000;
    });
  }, [enrollment, latest, now]);

  const flightHours = useMemo(
    () => (enrollment ? computeFlightHours(enrollment) : { perPhase: [], total: 0 }),
    [enrollment]
  );

  async function updateField(patch: Record<string, unknown>) {
    setSavingField(true);
    try {
      await apiFetch(`/api/enrollments/${enrollmentId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load();
      onChanged();
    } finally {
      setSavingField(false);
    }
  }

  async function handleCloseTraining(status: EnrollmentStatus) {
    if (!window.confirm(`Confirmer : ${STATUS_LABEL[status].toLowerCase()} cette formation ?`)) return;
    updateField({ status });
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-navy-900">
              {enrollment ? `${enrollment.student.firstName} ${enrollment.student.lastName}` : "Chargement..."}
            </h2>
            {enrollment && <p className="text-xs text-navy-600">{enrollment.program.title}</p>}
          </div>
          <div className="flex items-center gap-3">
            {enrollment && (
              <a
                href={`/formation/${enrollment.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-navy-600 hover:text-navy-900"
              >
                <FileDown size={14} /> Exporter en PDF
              </a>
            )}
            <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
              <X size={20} />
            </button>
          </div>
        </div>

        {enrollment && summary && (
          <>
            <div className="px-5 py-3 border-b border-navy-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-navy-500 text-xs">Statut</span>
                {isStaff ? (
                  <select
                    value={enrollment.status}
                    disabled={savingField}
                    onChange={(e) => handleCloseTraining(e.target.value as EnrollmentStatus)}
                    className={clsx(
                      "text-xs font-semibold rounded-full px-2 py-1 border-none",
                      STATUS_STYLE[enrollment.status]
                    )}
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={clsx("text-xs font-semibold rounded-full px-2 py-1", STATUS_STYLE[enrollment.status])}>
                    {STATUS_LABEL[enrollment.status]}
                  </span>
                )}
                {enrollment.completedAt && (
                  <span className="text-[11px] text-navy-500">le {formatDate(enrollment.completedAt)}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-navy-500 text-xs">Référent</span>
                {isStaff ? (
                  <select
                    value={enrollment.instructorId ?? ""}
                    disabled={savingField}
                    onChange={(e) => updateField({ instructorId: e.target.value || null })}
                    className="input py-1 text-xs w-auto"
                  >
                    <option value="">—</option>
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.firstName} {i.lastName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-navy-700">
                    {enrollment.instructor
                      ? `${enrollment.instructor.firstName} ${enrollment.instructor.lastName}`
                      : "—"}
                  </span>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-b border-navy-100 grid grid-cols-3 gap-3">
              <Stat label="Acquis" value={`${summary.done}/${summary.total}`} />
              <Stat label="En cours" value={String(summary.inProgress)} />
              <Stat label="Pas commencé" value={String(summary.todo)} />
            </div>

            {stuck.length > 0 && (
              <div className="px-5 py-3 bg-sunset-100/60 border-b border-navy-100">
                <p className="text-xs font-semibold text-sunset-600 mb-1">
                  Ça bloque depuis plus de 30 jours sur :
                </p>
                <p className="text-xs text-navy-700">
                  {stuck.map((ex) => `${ex.numero}. ${ex.intitule}`).join(" · ")}
                </p>
              </div>
            )}

            <div className="flex items-center flex-wrap gap-2 justify-between px-5 pt-3">
              <div className="flex gap-1 overflow-x-auto">
                <button
                  onClick={() => setTab("exercices")}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-medium rounded-lg shrink-0 whitespace-nowrap",
                    tab === "exercices" ? "bg-navy-800 text-white" : "text-navy-600 hover:bg-navy-50"
                  )}
                >
                  Exercices
                </button>
                <button
                  onClick={() => setTab("seances")}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-medium rounded-lg shrink-0 whitespace-nowrap",
                    tab === "seances" ? "bg-navy-800 text-white" : "text-navy-600 hover:bg-navy-50"
                  )}
                >
                  Séances ({enrollment.sessions?.length ?? 0})
                </button>
                <button
                  onClick={() => setTab("vol")}
                  className={clsx(
                    "px-3 py-1.5 text-sm font-medium rounded-lg shrink-0 whitespace-nowrap",
                    tab === "vol" ? "bg-navy-800 text-white" : "text-navy-600 hover:bg-navy-50"
                  )}
                >
                  Heures de vol
                </button>
              </div>
              {isStaff && (
                <button
                  onClick={() => setShowSession(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors"
                >
                  <GraduationCap size={16} /> Nouvelle séance
                </button>
              )}
            </div>

            {tab === "exercices" && (
              <div className="p-5 flex flex-col gap-2">
                {enrollment.program.phases.map((phase) => {
                  const open = openPhase === phase.id;
                  return (
                    <div key={phase.id} className="border border-navy-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setOpenPhase(open ? null : phase.id)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-navy-50 text-left"
                      >
                        <span className="text-sm font-semibold text-navy-900">
                          {phase.code} · {phase.title}
                        </span>
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      {open && (
                        <div className="divide-y divide-navy-100">
                          {phase.exercises.map((ex) => {
                            const p = latest.get(ex.id);
                            const level: ProgressLevel = p?.level ?? "NON_VU";
                            return (
                              <div key={ex.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm text-navy-800">
                                    <span className="text-navy-500">{ex.numero}.</span> {ex.intitule}
                                  </p>
                                  {p?.date && (
                                    <p className="text-[11px] text-navy-500">{formatDate(p.date)}</p>
                                  )}
                                </div>
                                <span className={clsx("text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap", LEVEL_STYLE[level])}>
                                  {LEVEL_LABEL[level]}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "seances" && (
              <div className="p-5 flex flex-col gap-3">
                {(enrollment.sessions ?? []).length === 0 && (
                  <p className="text-sm text-navy-600">Aucune séance enregistrée.</p>
                )}
                {(enrollment.sessions ?? []).map((s) => {
                  const canEditSession = canManage || (session?.user?.id && s.instructorId === session.user.id);
                  return (
                    <div key={s.id} className="rounded-xl border border-navy-100 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-navy-900">{formatDateTime(s.date)}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-navy-600">
                            {s.instructor.firstName} {s.instructor.lastName}
                            {s.aircraft ? ` · ${s.aircraft.registration}` : ""}
                            {s.flightLog ? ` · vol relié (${formatHours(s.flightLog.duration)})` : ""}
                          </span>
                          {canEditSession && (
                            <button
                              onClick={() => setEditSession(s)}
                              title="Modifier la séance"
                              className="text-navy-500 hover:text-navy-900"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      {s.remarks && <p className="text-xs text-navy-600 mt-1">{s.remarks}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {s.progress.map((p) => (
                          <span
                            key={p.id}
                            className={clsx("text-[11px] font-medium px-2 py-0.5 rounded-full", LEVEL_STYLE[p.level])}
                          >
                            {p.exercise?.numero}. {LEVEL_LABEL[p.level]}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "vol" && (
              <div className="p-5 flex flex-col gap-2">
                {flightHours.perPhase.length === 0 && (
                  <p className="text-sm text-navy-600">
                    Aucun vol relié à une séance pour l&apos;instant. Relie un vol depuis le formulaire de
                    séance pour voir apparaître le résumé ici.
                  </p>
                )}
                {flightHours.perPhase.map((p) => (
                  <div key={p.code} className="flex items-center justify-between text-sm px-1">
                    <span className="text-navy-700">
                      {p.code} · {p.title}
                    </span>
                    <span className="font-medium text-navy-900">{formatHours(p.hours)}</span>
                  </div>
                ))}
                {flightHours.perPhase.length > 0 && (
                  <div className="flex items-center justify-between text-sm font-semibold border-t border-navy-100 pt-2 mt-1 px-1">
                    <span className="text-navy-900">Total</span>
                    <span className="text-navy-900">{formatHours(flightHours.total)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {editSession && enrollment && (
        <SessionFormModal
          enrollment={enrollment}
          existing={editSession}
          onClose={() => setEditSession(null)}
          onSaved={() => {
            setEditSession(null);
            load();
            onChanged();
          }}
        />
      )}

      {showSession && enrollment && (
        <SessionFormModal
          enrollment={enrollment}
          onClose={() => setShowSession(false)}
          onSaved={() => {
            setShowSession(false);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-navy-50 rounded-xl p-3 text-center">
      <p className="text-lg font-bold text-navy-900">{value}</p>
      <p className="text-[11px] text-navy-600">{label}</p>
    </div>
  );
}

interface EntryDraft {
  exerciseId: string;
  numero: string;
  intitule: string;
  level: ProgressLevel;
  checked: boolean;
}

function SessionFormModal({
  enrollment,
  existing,
  onClose,
  onSaved,
}: {
  enrollment: Enrollment;
  existing?: TrainingSession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;

  // En édition, retrouve la phase des exercices déjà notés dans cette séance.
  const initialPhaseId = useMemo(() => {
    if (existing?.progress?.[0]) {
      const phase = enrollment.program.phases.find((ph) =>
        ph.exercises.some((ex) => ex.id === existing.progress[0].exerciseId)
      );
      if (phase) return phase.id;
    }
    return enrollment.program.phases[0]?.id ?? "";
  }, [existing, enrollment.program.phases]);

  const [date, setDate] = useState(
    existing ? existing.date.slice(0, 16) : new Date().toISOString().slice(0, 16)
  );
  const [aircraftId, setAircraftId] = useState(existing?.aircraftId ?? "");
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  const [flightLogId, setFlightLogId] = useState(existing?.flightLogId ?? "");
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([]);
  const [flightOptions, setFlightOptions] = useState<FlightLog[]>([]);
  const [phaseId, setPhaseId] = useState(initialPhaseId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const latest = useMemo(() => latestLevelByExercise(enrollment.progress), [enrollment.progress]);
  const existingLevels = useMemo(() => {
    const map = new Map<string, ProgressLevel>();
    for (const p of existing?.progress ?? []) map.set(p.exerciseId, p.level);
    return map;
  }, [existing]);

  const currentPhase = enrollment.program.phases.find((p) => p.id === phaseId);
  const [entries, setEntries] = useState<Record<string, EntryDraft>>({});
  const [entriesInitialized, setEntriesInitialized] = useState(false);

  useEffect(() => {
    apiFetch<Aircraft[]>("/api/aircraft").then(setAircraftList).catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch<FlightLog[]>(`/api/flights?studentId=${enrollment.studentId}&unlinked=true`)
      .then((flights) => {
        // Le vol déjà relié à cette séance (en édition) doit rester sélectionnable.
        if (existing?.flightLog && !flights.some((f) => f.id === existing.flightLog!.id)) {
          setFlightOptions([existing.flightLog, ...flights]);
        } else {
          setFlightOptions(flights);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollment.studentId]);

  useEffect(() => {
    if (!currentPhase) return;
    const initial: Record<string, EntryDraft> = {};
    for (const ex of currentPhase.exercises) {
      const editedLevel = !entriesInitialized ? existingLevels.get(ex.id) : undefined;
      initial[ex.id] = {
        exerciseId: ex.id,
        numero: ex.numero,
        intitule: ex.intitule,
        level: editedLevel ?? latest.get(ex.id)?.level ?? "NON_VU",
        checked: editedLevel !== undefined,
      };
    }
    setEntries(initial);
    setEntriesInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseId]);

  function toggle(exerciseId: string) {
    setEntries((prev) => ({ ...prev, [exerciseId]: { ...prev[exerciseId], checked: !prev[exerciseId].checked } }));
  }
  function setLevel(exerciseId: string, level: ProgressLevel) {
    setEntries((prev) => ({ ...prev, [exerciseId]: { ...prev[exerciseId], level, checked: true } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const selected = Object.values(entries).filter((e) => e.checked);
    if (selected.length === 0) {
      setError("Sélectionne au moins un exercice.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        date: new Date(date).toISOString(),
        aircraftId: aircraftId || null,
        flightLogId: flightLogId || null,
        remarks: remarks || null,
        entries: selected.map((s) => ({ exerciseId: s.exerciseId, level: s.level })),
      };
      if (isEdit && existing) {
        await apiFetch(`/api/enrollments/${enrollment.id}/sessions/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/enrollments/${enrollment.id}/sessions`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy-900">
            {isEdit ? "Modifier la séance" : "Nouvelle séance"}
          </h2>
          <button onClick={onClose} className="text-navy-600 hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Date</span>
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-navy-600">Avion (optionnel)</span>
              <select value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className="input">
                <option value="">—</option>
                {aircraftList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.registration}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">
              Vol relié (optionnel — pour le résumé d&apos;heures par phase)
            </span>
            <select value={flightLogId} onChange={(e) => setFlightLogId(e.target.value)} className="input">
              <option value="">—</option>
              {flightOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {formatDate(f.date)} · {f.aircraft.registration} · {formatHours(f.duration)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-navy-600">Phase</span>
            <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="input">
              {enrollment.program.phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.title}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto border border-navy-100 rounded-lg p-2">
            {Object.values(entries).map((entry) => (
              <div
                key={entry.exerciseId}
                className={clsx(
                  "flex items-center gap-2 px-2 py-1.5 rounded-lg",
                  entry.checked && "bg-navy-50"
                )}
              >
                <input
                  type="checkbox"
                  checked={entry.checked}
                  onChange={() => toggle(entry.exerciseId)}
                  className="shrink-0"
                />
                <span className="text-sm text-navy-800 flex-1 min-w-0 truncate">
                  {entry.numero}. {entry.intitule}
                </span>
                <select
                  value={entry.level}
                  onChange={(e) => setLevel(entry.exerciseId, e.target.value as ProgressLevel)}
                  className="text-xs border border-navy-100 rounded-md px-1.5 py-1 shrink-0"
                >
                  {Object.entries(LEVEL_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <textarea
            placeholder="Remarques sur la séance (optionnel)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="input min-h-16"
          />

          {error && <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : isEdit ? "Enregistrer les modifications" : "Enregistrer la séance"}
          </button>
        </form>
      </div>
    </div>
  );
}

