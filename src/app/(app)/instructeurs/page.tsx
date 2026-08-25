import { PageHeader } from "@/components/PageHeader";
import { InstructorsView } from "@/components/InstructorsView";

export default function InstructeursPage() {
  return (
    <div>
      <PageHeader title="Instructeurs" subtitle="Qualifications, tarifs et couleur planning" />
      <InstructorsView />
    </div>
  );
}
