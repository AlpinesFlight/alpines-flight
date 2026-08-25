import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatDate, formatHours } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = {
  NON_VU: "Non vu",
  VU: "Vue",
  ASSIMILE: "Assimilée",
  NIVEAU_CIBLE: "Niveau cible",
};

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  ABANDONED: "Abandonnée",
  SUSPENDED: "Suspendue",
};

export default async function EnrollmentPrintPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  const session = await auth();
  if (!session) redirect("/login");

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: true,
      instructor: true,
      program: {
        include: { phases: { orderBy: { order: "asc" }, include: { exercises: { orderBy: { order: "asc" } } } } },
      },
      progress: { orderBy: { date: "desc" } },
      sessions: { include: { flightLog: true } },
    },
  });

  if (!enrollment) notFound();
  if (session.user.role === "STUDENT" && enrollment.studentId !== session.user.id) {
    redirect("/formation");
  }

  // Niveau courant = ligne la plus récente par exercice.
  const latest = new Map<string, (typeof enrollment.progress)[number]>();
  for (const p of enrollment.progress) {
    if (!latest.has(p.exerciseId)) latest.set(p.exerciseId, p);
  }

  // Heures de vol par phase, à partir des séances reliées à un vol.
  const exerciseToPhaseCode = new Map<string, string>();
  for (const phase of enrollment.program.phases) {
    for (const ex of phase.exercises) exerciseToPhaseCode.set(ex.id, phase.code);
  }
  const hoursByPhase = new Map<string, number>();
  let totalHours = 0;
  for (const s of enrollment.sessions) {
    if (!s.flightLog) continue;
    const firstExerciseId = enrollment.progress.find((p) => p.sessionId === s.id)?.exerciseId;
    const phaseCode = firstExerciseId ? exerciseToPhaseCode.get(firstExerciseId) : undefined;
    const key = phaseCode ?? "—";
    hoursByPhase.set(key, (hoursByPhase.get(key) ?? 0) + s.flightLog.duration);
    totalHours += s.flightLog.duration;
  }

  const allExercises = enrollment.program.phases.flatMap((ph) => ph.exercises);
  const doneCount = allExercises.filter((ex) => {
    const level = latest.get(ex.id)?.level;
    return level === "ASSIMILE" || level === "NIVEAU_CIBLE";
  }).length;

  return (
    <div className="min-h-screen bg-white text-navy-900 print:bg-white">
      <PrintButton />
      <div className="max-w-3xl mx-auto p-10 print:p-0">
        <header className="flex items-center gap-4 border-b-2 border-navy-800 pb-4 mb-6">
          <Image src="/brand/logo-mark.png" alt="Alpines Flight" width={56} height={56} className="rounded-full" />
          <div>
            <h1 className="text-xl font-bold">Alpines Flight — Livret de progression</h1>
            <p className="text-sm text-navy-600">{enrollment.program.title}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Élève</p>
            <p className="font-medium">
              {enrollment.student.firstName} {enrollment.student.lastName}
            </p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Instructeur référent</p>
            <p className="font-medium">
              {enrollment.instructor
                ? `${enrollment.instructor.firstName} ${enrollment.instructor.lastName}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Statut</p>
            <p className="font-medium">
              {STATUS_LABEL[enrollment.status] ?? enrollment.status}
              {enrollment.completedAt ? ` — le ${formatDate(enrollment.completedAt)}` : ""}
            </p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Début de formation</p>
            <p className="font-medium">{formatDate(enrollment.startedAt)}</p>
          </div>
          {enrollment.program.referenceReglementaire && (
            <div className="col-span-2">
              <p className="text-navy-500 text-xs uppercase tracking-wide">Référence réglementaire</p>
              <p className="font-medium">{enrollment.program.referenceReglementaire}</p>
            </div>
          )}
        </section>

        <section className="mb-6 flex items-center gap-6 text-sm bg-navy-50 rounded-lg px-4 py-3">
          <span>
            <strong>{doneCount}</strong> / {allExercises.length} exercices acquis
          </span>
          <span>
            <strong>{formatHours(totalHours)}</strong> de vol au total
          </span>
        </section>

        {hoursByPhase.size > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-wide text-navy-700 mb-2">
              Heures de vol par phase
            </h2>
            <table className="w-full text-sm border-collapse">
              <tbody>
                {Array.from(hoursByPhase.entries()).map(([code, hours]) => (
                  <tr key={code} className="border-b border-navy-100">
                    <td className="py-1.5">{code}</td>
                    <td className="py-1.5 text-right font-medium">{formatHours(hours)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 font-bold">Total</td>
                  <td className="py-1.5 text-right font-bold">{formatHours(totalHours)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-navy-700 mb-2">
            Détail par phase
          </h2>
          {enrollment.program.phases.map((phase) => (
            <div key={phase.id} className="mb-5 break-inside-avoid">
              <h3 className="text-sm font-semibold bg-navy-800 text-white px-3 py-1.5 rounded-t-lg">
                {phase.code} · {phase.title}
              </h3>
              <table className="w-full text-xs border-collapse border border-t-0 border-navy-100 rounded-b-lg overflow-hidden">
                <thead>
                  <tr className="bg-navy-50 text-left text-navy-600">
                    <th className="px-3 py-1.5 font-medium">N°</th>
                    <th className="px-3 py-1.5 font-medium">Exercice</th>
                    <th className="px-3 py-1.5 font-medium">Niveau</th>
                    <th className="px-3 py-1.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {phase.exercises.map((ex) => {
                    const p = latest.get(ex.id);
                    return (
                      <tr key={ex.id} className="border-t border-navy-100">
                        <td className="px-3 py-1.5 text-navy-500">{ex.numero}</td>
                        <td className="px-3 py-1.5">{ex.intitule}</td>
                        <td className="px-3 py-1.5">{p ? LEVEL_LABEL[p.level] : "Non vu"}</td>
                        <td className="px-3 py-1.5 text-navy-500">{p ? formatDate(p.date) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <footer className="mt-10 pt-6 border-t border-navy-100 grid grid-cols-2 gap-8 text-sm">
          <div>
            <p className="text-navy-500 mb-8">Signature de l&apos;instructeur</p>
            <div className="border-t border-navy-300" />
          </div>
          <div>
            <p className="text-navy-500 mb-8">Signature de l&apos;élève</p>
            <div className="border-t border-navy-300" />
          </div>
        </footer>

        <p className="text-[10px] text-navy-400 mt-8 text-center">
          Document généré le {formatDate(new Date().toISOString())} — Alpines Flight, DTO n°0889
        </p>
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
