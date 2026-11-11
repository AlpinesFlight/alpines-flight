import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LicencesView } from "@/components/LicencesView";
import { auth } from "@/lib/auth";
import { isInstructorOrAbove } from "@/lib/permissions";

export default async function LicencesPage() {
  const session = await auth();
  // Un élève/pilote ne voit que son propre dossier (voir LicencesView) — le
  // sous-titre reflète ça plutôt que de laisser croire à une vue
  // d'ensemble de l'école.
  const isSelfOnly = !isInstructorOrAbove(session?.user?.role);

  return (
    <div>
      <PageHeader
        title="Licences & qualifications"
        subtitle={
          isSelfOnly
            ? "Mon dossier : licence, certificat médical, qualifications"
            : "Échéances des instructeurs, pilotes et élèves"
        }
      />
      <Suspense fallback={null}>
        <LicencesView />
      </Suspense>
    </div>
  );
}
