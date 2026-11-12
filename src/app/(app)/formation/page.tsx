import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { TrainingView } from "@/components/TrainingView";
import { auth } from "@/lib/auth";
import { isInstructorOrAbove } from "@/lib/permissions";

export default async function FormationPage() {
  // Retirée des comptes élève/pilote (absente de leur menu, voir Sidebar.tsx)
  // — un accès direct par l'adresse les ramène à l'accueil.
  const session = await auth();
  if (!isInstructorOrAbove(session?.user?.role)) redirect("/");

  return (
    <div>
      <PageHeader
        title="Formation"
        subtitle="Livrets de progression — inscriptions, séances et suivi"
      />
      <TrainingView />
    </div>
  );
}
