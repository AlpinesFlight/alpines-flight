import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSchool } from "@/lib/permissions";
import { safeUserSelect } from "@/lib/selects";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Date complète, année comprise (document de preuve), heure de Paris.
function formatDateTime(d: Date): string {
  return d
    .toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(" ", " à ");
}

// Preuve de diffusion d'une actualité réservée aux instructeurs, à imprimer
// ou enregistrer en PDF pour un contrôle (DGAC) : le message, la liste de
// diffusion figée à la publication, et pour chaque instructeur la date de
// confirmation de lecture. Réservé à la gestion.
export default async function AnnouncementProofPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canManageSchool(session.user.role)) redirect("/");

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: {
      title: true,
      body: true,
      audience: true,
      createdAt: true,
      createdBy: { select: safeUserSelect },
      attachments: { select: { fileName: true }, orderBy: { uploadedAt: "asc" } },
      recipients: {
        select: { notifiedAt: true, acknowledgedAt: true, user: { select: safeUserSelect } },
        orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      },
    },
  });
  if (!announcement || announcement.audience !== "INSTRUCTORS") notFound();

  const read = announcement.recipients.filter((r) => r.acknowledgedAt).length;
  const total = announcement.recipients.length;

  return (
    <div className="min-h-screen bg-white text-navy-900 print:bg-white">
      <PrintButton />
      <div className="max-w-3xl mx-auto p-10 print:p-0">
        <header className="flex items-center gap-4 border-b-2 border-navy-800 pb-4 mb-6">
          <Image src="/brand/logo-mark.png" alt="Alpines Flight" width={56} height={56} className="rounded-full" />
          <div>
            <h1 className="text-xl font-bold">Alpines Flight — Preuve de diffusion</h1>
            <p className="text-sm text-navy-600">Actualité réservée aux instructeurs, avec accusé de lecture</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Publiée le</p>
            <p className="font-medium">{formatDateTime(announcement.createdAt)}</p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Par</p>
            <p className="font-medium">
              {announcement.createdBy.firstName} {announcement.createdBy.lastName}
            </p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Diffusée à</p>
            <p className="font-medium">
              {total} instructeur{total > 1 ? "s" : ""}
            </p>
          </div>
          <div>
            <p className="text-navy-500 text-xs uppercase tracking-wide">Lecture confirmée</p>
            <p className="font-medium">
              {read} sur {total}
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-navy-100 p-4 break-inside-avoid">
          <p className="text-navy-500 text-xs uppercase tracking-wide mb-1">Message diffusé</p>
          <p className="font-semibold mb-2">{announcement.title}</p>
          <p className="text-sm whitespace-pre-wrap">{announcement.body}</p>
          {announcement.attachments.length > 0 && (
            <p className="text-xs text-navy-600 mt-3">
              Pièces jointes : {announcement.attachments.map((a) => a.fileName).join(", ")}
            </p>
          )}
        </section>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-navy-700 mb-2">
            Liste de diffusion et accusés de lecture
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-navy-800 text-white text-left">
                <th className="px-3 py-2 font-medium">Instructeur</th>
                <th className="px-3 py-2 font-medium">Diffusée le</th>
                <th className="px-3 py-2 font-medium">Lecture confirmée le</th>
              </tr>
            </thead>
            <tbody>
              {announcement.recipients.map((r) => (
                <tr key={r.user.id} className="border-b border-navy-100">
                  <td className="px-3 py-2">
                    {r.user.lastName.toUpperCase()} {r.user.firstName}
                  </td>
                  <td className="px-3 py-2 text-navy-700">{formatDateTime(r.notifiedAt)}</td>
                  <td className="px-3 py-2">
                    {r.acknowledgedAt ? (
                      <span className="font-medium">{formatDateTime(r.acknowledgedAt)}</span>
                    ) : (
                      <span className="text-sunset-600 font-medium">Non confirmée à ce jour</span>
                    )}
                  </td>
                </tr>
              ))}
              {total === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-navy-600">
                    Aucun instructeur dans la liste de diffusion.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <p className="text-[10px] text-navy-400 mt-8 text-center">
          Document généré le {formatDateTime(new Date())} — Alpines Flight, DTO n°0889. Dates et heures de Paris,
          enregistrées par l&apos;application au moment de la publication et de chaque confirmation de lecture.
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
