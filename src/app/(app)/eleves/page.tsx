import { PageHeader } from "@/components/PageHeader";
import { StudentsView } from "@/components/StudentsView";

export default function ElevesPage() {
  return (
    <div>
      <PageHeader title="Élèves & pilotes" subtitle="Membres, licences, heures et comptes" />
      <StudentsView />
    </div>
  );
}
