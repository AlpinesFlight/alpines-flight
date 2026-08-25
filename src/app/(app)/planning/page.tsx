import { PageHeader } from "@/components/PageHeader";
import { PlanningView } from "@/components/PlanningView";

export default function PlanningPage() {
  return (
    <div>
      <PageHeader
        title="Planning"
        subtitle="Réservations avions et instructeurs"
      />
      <PlanningView />
    </div>
  );
}
