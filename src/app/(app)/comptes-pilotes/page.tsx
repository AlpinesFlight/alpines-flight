import { PageHeader } from "@/components/PageHeader";
import { BillingView } from "@/components/BillingView";

export default function ComptesPilotesPage() {
  return (
    <div>
      <PageHeader
        title="Comptes pilotes"
        subtitle="Versements, vérification bancaire et débits de vol"
      />
      <BillingView />
    </div>
  );
}
