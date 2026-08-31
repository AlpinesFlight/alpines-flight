import { PageHeader } from "@/components/PageHeader";
import { InstructorAvailabilityView } from "@/components/InstructorAvailabilityView";
import { PlanningTabs } from "@/components/PlanningTabs";

export default function DisponibilitesPage() {
  return (
    <div>
      <PageHeader
        title="Disponibilités FI"
        subtitle="Visible uniquement des instructeurs et du Gérant"
      />
      <PlanningTabs />
      <InstructorAvailabilityView />
    </div>
  );
}
