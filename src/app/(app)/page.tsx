import { prisma } from "@/lib/prisma";
import { safeUserSelect, safeAircraftSelect } from "@/lib/selects";
import { PageHeader } from "@/components/PageHeader";
import { AnnouncementsCard } from "@/components/AnnouncementsCard";
import { formatDateTime, formatHours } from "@/lib/format";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import Link from "next/link";
import {
  CalendarDays,
  TriangleAlert,
  Wallet,
  PlaneTakeoff,
  Plane,
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
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [todayReservations, maintenanceAlerts, negativeStudents, monthFlights] =
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
      prisma.maintenanceRecord.findMany({
        where: { status: { in: ["DUE", "OVERDUE"] } },
        include: { aircraft: { select: safeAircraftSelect } },
      }),
      // Seul le compte (.length) est utilisé plus bas — count() plutôt que
      // findMany({ include: { user: true } }), qui aurait à la fois envoyé
      // les User complets (passwordHash compris) pour rien et fait plus de
      // travail que nécessaire.
      prisma.studentProfile.count({
        where: { balanceCents: { lt: 0 } },
      }),
      prisma.flightLog.findMany({
        where: { date: { gte: monthStart, lte: monthEnd } },
      }),
    ]);

  const monthHours = monthFlights.reduce((sum, f) => sum + f.duration, 0);
  const inFlight = todayReservations.filter((r) => r.status === "IN_FLIGHT");
  const upcoming = todayReservations.filter((r) => r.status === "CONFIRMED");
  const doneToday = todayReservations.filter((r) => r.status === "COMPLETED");

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

      <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarDays}
          label="Réservations aujourd'hui"
          value={String(todayReservations.length)}
          color="sunset"
        />
        <StatCard
          icon={TriangleAlert}
          label="Alertes maintenance"
          value={String(maintenanceAlerts.length)}
          color="red"
        />
        <StatCard
          icon={Wallet}
          label="Élèves à solde négatif"
          value={String(negativeStudents)}
          color="navy"
        />
        <StatCard
          icon={PlaneTakeoff}
          label="Heures volées ce mois-ci"
          value={formatHours(monthHours)}
          color="navy"
          href={`/vols?from=${toIsoDate(monthStart)}&to=${toIsoDate(monthEnd)}`}
        />
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
      </div>

      <div className="px-4 md:px-8 pb-8">
        <AnnouncementsCard />
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
      return "Solo";
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
