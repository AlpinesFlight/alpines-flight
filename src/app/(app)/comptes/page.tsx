import { PageHeader } from "@/components/PageHeader";
import { AccountsView } from "@/components/AccountsView";

export default function ComptesPage() {
  return (
    <div>
      <PageHeader title="Comptes & droits" subtitle="Attribuer un rôle à chaque compte de l'école" />
      <AccountsView />
    </div>
  );
}
