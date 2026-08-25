import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LicencesView } from "@/components/LicencesView";

export default function LicencesPage() {
  return (
    <div>
      <PageHeader
        title="Licences & qualifications"
        subtitle="Vue d'ensemble — élèves et instructeurs"
      />
      <Suspense fallback={null}>
        <LicencesView />
      </Suspense>
    </div>
  );
}
