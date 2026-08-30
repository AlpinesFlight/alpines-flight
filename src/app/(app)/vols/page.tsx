import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FlightsView } from "@/components/FlightsView";
import { auth } from "@/lib/auth";

export default async function VolsPage() {
  const session = await auth();
  // Seul le Gérant voit le carnet complet de l'école (voir /api/flights) —
  // le sous-titre reflète ce que chacun voit réellement plutôt que de
  // laisser croire à tout le monde qu'il consulte l'historique complet.
  const isGerant = session?.user?.role === "GERANT";

  return (
    <div>
      <PageHeader
        title="Vols"
        subtitle={
          isGerant
            ? "Carnet de vol de l'école — résumé, coûts, historique"
            : "Historique des vols auxquels tu as participé (élève ou instructeur)"
        }
      />
      <Suspense fallback={null}>
        <FlightsView />
      </Suspense>
    </div>
  );
}
