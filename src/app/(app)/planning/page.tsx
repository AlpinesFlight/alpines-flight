import { PageHeader } from "@/components/PageHeader";
import { PlanningView } from "@/components/PlanningView";
import { PlanningTabs } from "@/components/PlanningTabs";

export default function PlanningPage() {
  return (
    <div>
      <PageHeader
        title="Planning"
        subtitle="Réservations avions et instructeurs"
      />
      <PlanningTabs />
      <PlanningView />
    </div>
  );
}
