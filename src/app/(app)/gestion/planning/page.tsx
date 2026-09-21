import { PageHeader } from "@/components/PageHeader";
import { GestionTabs } from "@/components/GestionTabs";
import { GestionPlanningView } from "@/components/GestionPlanningView";

export default function GestionPlanningPage() {
  return (
    <div>
      <PageHeader title="Gestion" subtitle="Agenda administratif (banque, DGAC, échéances...)" />
      <GestionTabs />
      <GestionPlanningView />
    </div>
  );
}
