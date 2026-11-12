import { PageHeader } from "@/components/PageHeader";
import { BillingView } from "@/components/BillingView";
import { auth } from "@/lib/auth";
import { canManageFinance } from "@/lib/permissions";

export default async function ComptesPilotesPage() {
  // Le Gérant gère les comptes de tout le monde ; tout autre compte
  // (instructeur, admin, élève/pilote) n'y voit que le sien — voir
  // BillingView et /api/transactions.
  const session = await auth();
  const allAccounts = canManageFinance(session?.user?.role);

  return (
    <div>
      <PageHeader
        title={allAccounts ? "Comptes pilotes" : "Mon compte pilote"}
        subtitle={
          allAccounts
            ? "Versements, vérification bancaire et débits de vol"
            : "Mon solde, mes versements et mes débits de vol"
        }
      />
      <BillingView />
    </div>
  );
}
