import { PageHeader } from "@/components/PageHeader";
import { GestionTabs } from "@/components/GestionTabs";
import { GestionDocumentsView } from "@/components/GestionDocumentsView";

export default function GestionPage() {
  return (
    <div>
      <PageHeader title="Gestion" subtitle="Documents à transmettre au comptable" />
      <GestionTabs />
      <GestionDocumentsView />
    </div>
  );
}
