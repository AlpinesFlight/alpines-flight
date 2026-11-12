import { PageHeader } from "@/components/PageHeader";
import { PlanningView } from "@/components/PlanningView";
import { PlanningTabs } from "@/components/PlanningTabs";

export default function PlanningPage() {
  return (
    // Colonne pleine hauteur d'écran (moins la barre du haut mobile, 56px,
    // voir Sidebar.tsx) : le planning prend tout l'espace restant sous
    // l'en-tête et les onglets, quelle que soit leur hauteur — l'ancien
    // calcul fixe ignorait les onglets (FI/Gérant) et faisait défiler la
    // page en plus du planning.
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-dvh">
      <PageHeader title="Planning" subtitle="Réservations avions et instructeurs" />
      <PlanningTabs />
      <PlanningView />
    </div>
  );
}
