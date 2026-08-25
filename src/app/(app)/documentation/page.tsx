import { PageHeader } from "@/components/PageHeader";
import { DocumentationView } from "@/components/DocumentationView";

export default function DocumentationPage() {
  return (
    <div>
      <PageHeader title="Documentation" subtitle="Procédures, manuels et réglementation de l'école" />
      <DocumentationView />
    </div>
  );
}
