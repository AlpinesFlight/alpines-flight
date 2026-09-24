import { GestionAircraftMaintenanceView } from "@/components/GestionAircraftMaintenanceView";

export default async function GestionAircraftMaintenancePage({
  params,
}: {
  params: Promise<{ aircraftId: string }>;
}) {
  const { aircraftId } = await params;
  return <GestionAircraftMaintenanceView aircraftId={aircraftId} />;
}
