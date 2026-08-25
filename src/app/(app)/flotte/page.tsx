import { PageHeader } from "@/components/PageHeader";
import { FleetView } from "@/components/FleetView";

export default function FlottePage() {
  return (
    <div>
      <PageHeader title="Flotte" subtitle="Avions et suivi de maintenance" />
      <FleetView />
    </div>
  );
}
