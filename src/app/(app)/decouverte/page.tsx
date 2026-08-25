import { PageHeader } from "@/components/PageHeader";
import { DecouverteView } from "@/components/DecouverteView";

export default function DecouvertePage() {
  return (
    <div>
      <PageHeader title="Vol découverte" subtitle="Gestion interne des vols d'initiation et baptêmes de l'air" />
      <DecouverteView />
    </div>
  );
}
