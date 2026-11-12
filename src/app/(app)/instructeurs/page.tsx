import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { InstructorsView } from "@/components/InstructorsView";
import { auth } from "@/lib/auth";
import { isInstructorOrAbove } from "@/lib/permissions";

export default async function InstructeursPage() {
  // Retirée des comptes élève/pilote (absente de leur menu, voir Sidebar.tsx)
  // — un accès direct par l'adresse les ramène à l'accueil.
  const session = await auth();
  if (!isInstructorOrAbove(session?.user?.role)) redirect("/");

  return (
    <div>
      <PageHeader title="Instructeurs" subtitle="Qualifications, tarifs et couleur planning" />
      <InstructorsView />
    </div>
  );
}
