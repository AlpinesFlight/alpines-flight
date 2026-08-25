import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FlightsView } from "@/components/FlightsView";

export default function VolsPage() {
  return (
    <div>
      <PageHeader title="Vols" subtitle="Carnet de vol de l'école — résumé, coûts, historique" />
      <Suspense fallback={null}>
        <FlightsView />
      </Suspense>
    </div>
  );
}
