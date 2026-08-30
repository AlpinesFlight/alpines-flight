import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LicencesView } from "@/components/LicencesView";
import { auth } from "@/lib/auth";

export default async function LicencesPage() {
  const session = await auth();
  // Un élève/pilote ne voit que ses propres licences (voir LicencesView) —
  // le sous-titre reflète ça plutôt que de laisser croire à une vue
  // d'ensemble de l'école.
  const isSelfOnly = session?.user?.role === "STUDENT";

  return (
    <div>
      <PageHeader
        title="Licences & qualifications"
        subtitle={isSelfOnly ? "Mes documents" : "Vue d'ensemble — élèves et instructeurs"}
      />
      <Suspense fallback={null}>
        <LicencesView />
      </Suspense>
    </div>
  );
}
