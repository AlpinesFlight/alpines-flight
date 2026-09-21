import { PageHeader } from "@/components/PageHeader";
import { GestionTabs } from "@/components/GestionTabs";
import { GestionVisioView } from "@/components/GestionVisioView";

export default function GestionVisioPage() {
  return (
    <div>
      <PageHeader title="Gestion" subtitle="Visioconférence instantanée" />
      <GestionTabs />
      <GestionVisioView />
    </div>
  );
}
