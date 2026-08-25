import { PageHeader } from "@/components/PageHeader";
import { TrainingView } from "@/components/TrainingView";

export default function FormationPage() {
  return (
    <div>
      <PageHeader
        title="Formation"
        subtitle="Livrets de progression — inscriptions, séances et suivi"
      />
      <TrainingView />
    </div>
  );
}
