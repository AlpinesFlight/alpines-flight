import { GestionProjectDetailView } from "@/components/GestionProjectDetailView";

export default async function GestionProjetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GestionProjectDetailView projectId={id} />;
}
