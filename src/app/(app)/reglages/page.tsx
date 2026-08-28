import { PageHeader } from "@/components/PageHeader";
import { ReglagesView } from "@/components/ReglagesView";

export default function ReglagesPage() {
  return (
    <div>
      <PageHeader title="Réglages" subtitle="Notifications par email envoyées automatiquement par l'appli" />
      <ReglagesView />
    </div>
  );
}
