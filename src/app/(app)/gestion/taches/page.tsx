import { PageHeader } from "@/components/PageHeader";
import { GestionTabs } from "@/components/GestionTabs";
import { GestionTasksView } from "@/components/GestionTasksView";

export default function GestionTachesPage() {
  return (
    <div>
      <PageHeader title="Gestion" subtitle="Tâches internes, priorités et échéances" />
      <GestionTabs />
      <GestionTasksView />
    </div>
  );
}
