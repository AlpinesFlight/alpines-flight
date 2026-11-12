import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { AnnouncementsCard } from "@/components/AnnouncementsCard";
import { MaintenanceIssuesCard } from "@/components/MaintenanceIssuesCard";
import { formatDateTime, formatHoursMinutes, formatMoney } from "@/lib/format";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { canManageSchool } from "@/lib/permissions";
import { loadLicencesData } from "@/lib/qualifications";
import { linesByPerson } from "@/lib/licence-lines";
import { personGroup, stateDetail } from "@/lib/qualification-catalog";
import Link from "next/link";
import {
  CalendarDays,
  TriangleAlert,
  Wallet,
  PlaneTakeoff,
  Plane,
  Wrench,
  ShieldAlert,
} from "lucide-react";

export const dynamic = "force-dynamic";

// Formate en "YYYY-MM-DD" à partir des composants locaux (pas
// toISOString(), qui convertit en UTC et peut faire glisser la date d'un
// jour selon le fuseau du serveur) — utilisé pour construire le lien vers
// /vols avec les bornes du mois en cours.
function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default async function DashboardPage() {
  const session = await auth();
  // Les échéances de maintenance programmée (visites, CDN...) sont une
  // affaire de gestion de flotte — le Gérant seul les voit sur le tableau
  // de bord ; tout autre compte voit à la place le bloc "Retour
  // maintenance" (signaler/suivre un défaut, voir MaintenanceIssuesCard).
  const isGerant = session?.user?.role === "GERANT";
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle={now.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      />

      <Suspense fallback={null}>
        <LicenceAlert role={session?.user?.role} userId={session?.user?.id} />
      </Suspense>

      {/* Les chiffres, le planning du jour et les alertes attendent la base —
          et, sur le plan gratuit Neon, son réveil après 5 min sans activité.
          En Suspense, le menu, l'en-tête et les blocs chargés par le
          navigateur (signalements, annonces) s'affichent tout de suite, au
          lieu d'un écran vide jusqu'à la réponse complète. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent
          isGerant={isGerant}
          isPilotAccount={session?.user?.role === "STUDENT"}
          userId={session?.user?.id}
          now={now}
        />
      </Suspense>

      {isGerant && (
        <div className="px-4 md:px-8 pb-6">
          <MaintenanceIssuesCard />
        </div>
      )}

      <div className="px-4 md:px-8 pb-8">
        <AnnouncementsCard />
      </div>
    </div>
  );
}

// Licences et qualifications à traiter — Gérant/Admin : toute l'école ; tout
// autre compte : son propre dossier. Rien n'est affiché quand tout est en
// règle. Suspense à part : ne retarde jamais le reste du tableau de bord.
async function LicenceAlert({ role, userId }: { role?: string; userId?: string }) {
  if (!userId) return null;
  const schoolWide = canManageSchool(role);
  const data = await loadLicencesData(schoolWide ? {} : { onlyUserId: userId });
  const lines = linesByPerson(data.people, data.qualifications);

  let title: string;
  let detail: string;
  let urgent: boolean;
  if (schoolWide) {
    const all = data.people.flatMap((p) => (lines.get(p.id) ?? []).map((line) => ({ person: p, line })));
    const count = (states: string[]) => all.filter((r) => states.includes(r.line.state)).length;
    const parts = (
      [
        [count(["expired"]), "échéance(s) dépassée(s)"],
        [count(["missing"]), "manquante(s)"],
        [count(["dateMissing"]), "date(s) à renseigner"],
        [count(["due"]), "à renouveler bientôt"],
      ] as const
    ).filter(([n]) => n > 0);
    if (parts.length === 0) return null;
    const instructors = new Set(
      all
        .filter(
          (r) =>
            personGroup(r.person) === "INSTRUCTOR" && ["expired", "missing", "dateMissing"].includes(r.line.state)
        )
        .map((r) => r.person.id)
    ).size;
    title = `Licences et qualifications : ${parts.map(([n, label]) => `${n} ${label}`).join(", ")}`;
    detail =
      (instructors > 0 ? `Dont ${instructors} instructeur(s) au dossier incomplet ou expiré — ` : "") +
      "voir le tableau des échéances";
    urgent = count(["expired", "missing"]) > 0;
  } else {
    const mine = (lines.get(userId) ?? []).filter((l) =>
      ["expired", "missing", "dateMissing", "due"].includes(l.state)
    );
    if (mine.length === 0) return null;
    title = "Ton dossier licences demande ton attention";
    detail = mine
      .map((l) => `${l.label} : ${l.state === "missing" ? "non renseigné" : stateDetail(l.state, l.days).toLowerCase()}`)
      .join(" · ");
    urgent = mine.some((l) => l.state === "expired" || l.state === "missing");
  }

  return (
    <div className="px-4 md:px-8 pt-4 md:pt-8 -mb-2 md:-mb-4">
      <Link
        href="/licences"
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${
          urgent
            ? "border-red-100 bg-red-100/40 hover:bg-red-100/70"
            : "border-sunset-100 bg-sunset-100/40 hover:bg-sunset-100/70"
        }`}
      >
        <ShieldAlert size={18} className={`mt-0.5 shrink-0 ${urgent ? "text-red-600" : "text-sunset-600"}`} />
        <div className="text-sm">
          <p className="font-semibold text-navy-900">{title}</p>
          <p className="text-xs text-navy-600">{detail}</p>
        </div>
      </Link>
    </div>
  );
}

async function DashboardContent({
  isGerant,
  isPilotAccount,
  userId,
  now,
}: {
  isGerant: boolean;
  // Compte élève/pilote : son solde et ses heures à la place des chiffres de
  // l'école (élèves à solde négatif, heures du mois), qui ne le concernent pas.
  isPilotAccount: boolean;
  userId: string | undefined;
  now: Date;
}) {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [todayReservations, maintenanceAlerts, myOpenIssues, negativeStudents, monthFlights, myAccount] =
    await Promise.all([
      prisma.reservation.findMany({
        where: {
          status: { not: "CANCELLED" },
          startTime: { gte: todayStart, lte: todayEnd },
        },
        include: {
          aircraft: { select: safeAircraftSelect },
          student: { select: safeUserSelect },
          instructor: { select: safeUserSelect },
        },
        orderBy: { startTime: "asc" },
      }),
      isGerant
        ? prisma.maintenanceRecord.findMany({
            where: { status: { in: ["DUE", "OVERDUE"] } },
            include: { aircraft: { select: safeAircraftSelect } },
          })
        : Promise.resolve([]),
      isGerant || !userId
        ? Promise.resolve(0)
        : prisma.maintenanceIssue.count({
            where: { reportedById: userId, status: "OPEN" },
          }),
      // Seul le compte (.length) est utilisé plus bas — count() plutôt que
      // findMany({ include: { user: true } }), qui aurait à la fois envoyé
      // les User complets (passwordHash compris) pour rien et fait plus de
      // travail que nécessaire.
      isPilotAccount
        ? Promise.resolve(0)
        : prisma.studentProfile.count({
            where: { balanceCents: { lt: 0 } },
          }),
      isPilotAccount
        ? Promise.resolve([])
        : prisma.flightLog.findMany({
            where: { date: { gte: monthStart, lte: monthEnd } },
          }),
      // Mêmes chiffres que sa page Comptes pilotes (solde) et la page Élèves
      // (heures totales, tenues à jour à chaque vol clôturé ou corrigé).
      isPilotAccount && userId
        ? prisma.studentProfile.findUnique({
            where: { userId },
            select: { balanceCents: true, totalHours: true },
          })
        : Promise.resolve(null),
    ]);

  const monthHours = monthFlights.reduce((sum, f) => sum + f.duration, 0);
  const inFlight = todayReservations.filter((r) => r.status === "IN_FLIGHT");
  const upcoming = todayReservations.filter((r) => r.status === "CONFIRMED");
  const doneToday = todayReservations.filter((r) => r.status === "COMPLETED");

  return (
    <>
      <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarDays}
          label="Réservations aujourd'hui"
          value={String(todayReservations.length)}
          color="sunset"
        />
        {isGerant ? (
          <StatCard
            icon={TriangleAlert}
            label="Alertes maintenance"
            value={String(maintenanceAlerts.length)}
            color="red"
          />
        ) : (
          <StatCard
            icon={Wrench}
            label="Mes signalements ouverts"
            value={String(myOpenIssues)}
            color="navy"
          />
        )}
        {isPilotAccount ? (
          <>
            <StatCard
              icon={Wallet}
              label="Mon solde"
              value={formatMoney(myAccount?.balanceCents ?? 0)}
              color={(myAccount?.balanceCents ?? 0) < 0 ? "red" : "navy"}
              href="/comptes-pilotes"
            />
            <StatCard
              icon={PlaneTakeoff}
              label="Mes heures de vol"
              value={formatHoursMinutes(myAccount?.totalHours ?? 0)}
              color="navy"
              href="/vols"
            />
          </>
        ) : (
          <>
            <StatCard
              icon={Wallet}
              label="Élèves à solde négatif"
              value={String(negativeStudents)}
              color="navy"
            />
            <StatCard
              icon={PlaneTakeoff}
              label="Heures volées ce mois-ci"
              value={formatHoursMinutes(monthHours)}
              color="navy"
              href={`/vols?from=${toIsoDate(monthStart)}&to=${toIsoDate(monthEnd)}`}
            />
          </>
        )}
      </div>

      <div className="px-4 md:px-8 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
            <h2 className="font-semibold text-navy-900">Planning du jour</h2>
            <Link href="/planning" className="text-sm text-sunset-600 hover:underline">
              Voir le planning
            </Link>
          </div>

          {todayReservations.length === 0 && (
            <p className="px-5 py-6 text-sm text-navy-600">
              Aucune réservation aujourd&apos;hui.
            </p>
          )}

          {inFlight.length > 0 && (
            <div>
              <p className="px-5 pt-3 pb-1 text-[11px] font-semibold text-sunset-600 uppercase tracking-wide">
                En vol
              </p>
              <div className="divide-y divide-navy-100">
                {inFlight.map((r) => (
                  <FlightRow key={r.id} r={r} highlight />
                ))}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <p className="px-5 pt-3 pb-1 text-[11px] font-semibold text-navy-500 uppercase tracking-wide">
                Prévus
              </p>
              <div className="divide-y divide-navy-100">
                {upcoming.map((r) => (
                  <FlightRow key={r.id} r={r} />
                ))}
              </div>
            </div>
          )}

          {doneToday.length > 0 && (
            <div>
              <p className="px-5 pt-3 pb-1 text-[11px] font-semibold text-green-700 uppercase tracking-wide">
                Terminés
              </p>
              <div className="divide-y divide-navy-100">
                {doneToday.map((r) => (
                  <FlightRow key={r.id} r={r} muted />
                ))}
              </div>
            </div>
          )}
          <div className="pb-1" />
        </div>

        {isGerant ? (
          <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-100">
              <h2 className="font-semibold text-navy-900">Alertes maintenance</h2>
              <Link href="/flotte" className="text-sm text-sunset-600 hover:underline">
                Voir la flotte
              </Link>
            </div>
            <div className="divide-y divide-navy-100">
              {maintenanceAlerts.length === 0 && (
                <p className="px-5 py-6 text-sm text-navy-600">
                  Aucune échéance urgente.
                </p>
              )}
              {maintenanceAlerts.map((m) => (
                <div key={m.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-navy-900">
                      {m.aircraft.registration} · {m.label}
                    </p>
                    <p className="text-xs text-navy-600">
                      {m.type === "HOURLY"
                        ? `Échéance à ${m.dueAtHours}h`
                        : m.dueAtDate
                        ? `Échéance le ${new Date(m.dueAtDate).toLocaleDateString("fr-FR")}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      m.status === "OVERDUE"
                        ? "bg-red-100 text-red-600"
                        : "bg-sunset-100 text-sunset-600"
                    }`}
                  >
                    {m.status === "OVERDUE" ? "Dépassé" : "À prévoir"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <MaintenanceIssuesCard />
        )}
      </div>
    </>
  );
}

// Même gabarit que DashboardContent (4 chiffres, puis 2 blocs) pour que la
// page ne saute pas à l'arrivée des données.
function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement du tableau de bord">
      <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-navy-100 p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-navy-100 animate-pulse" />
            <div className="flex flex-col gap-2">
              <div className="h-6 w-12 rounded bg-navy-100 animate-pulse" />
              <div className="h-3 w-28 rounded bg-navy-50 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 md:px-8 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-navy-100 h-48 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function FlightRow({
  r,
  highlight,
  muted,
}: {
  r: {
    id: string;
    type: string;
    startTime: Date;
    aircraft: { registration: string };
    student: { firstName: string; lastName: string } | null;
    instructor: { firstName: string; lastName: string } | null;
  };
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`px-5 py-3 flex items-center justify-between gap-3 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            highlight ? "bg-sunset-100 text-sunset-600" : "bg-navy-100 text-navy-600"
          }`}
        >
          <Plane size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy-900 truncate">
            {r.aircraft.registration} · {typeLabel(r.type)}
          </p>
          <p className="text-xs text-navy-600 truncate">
            {r.student ? `${r.student.firstName} ${r.student.lastName}` : "—"}
            {r.instructor ? ` avec ${r.instructor.firstName} ${r.instructor.lastName}` : ""}
          </p>
        </div>
      </div>
      <span className="text-xs text-navy-600 whitespace-nowrap shrink-0">
        {formatDateTime(r.startTime)}
      </span>
    </div>
  );
}

function typeLabel(type: string) {
  switch (type) {
    case "INSTRUCTION":
      return "Instruction";
    case "SOLO":
      return "Solo supervisé";
    case "LOCATION":
      return "Location";
    case "MAINTENANCE":
      return "Maintenance";
    default:
      return type;
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  href,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  color: "sunset" | "red" | "navy";
  href?: string;
}) {
  const bg = {
    sunset: "bg-sunset-100 text-sunset-600",
    red: "bg-red-100 text-red-600",
    navy: "bg-navy-100 text-navy-800",
  }[color];

  const content = (
    <>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${bg}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-navy-900 leading-tight">{value}</p>
        <p className="text-xs text-navy-600">{label}</p>
      </div>
    </>
  );

  const className =
    "bg-white rounded-2xl border border-navy-100 p-5 flex items-center gap-4" +
    (href ? " hover:shadow-md hover:border-navy-200 transition-shadow" : "");

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}
