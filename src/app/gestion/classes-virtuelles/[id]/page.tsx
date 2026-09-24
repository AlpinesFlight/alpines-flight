import { GestionClasseVirtuelleDetailView } from "@/components/GestionClasseVirtuelleDetailView";

export default async function GestionClasseVirtuelleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GestionClasseVirtuelleDetailView classId={id} />;
}
