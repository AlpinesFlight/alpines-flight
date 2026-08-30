import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    // flex-col en dessous de md (barre du haut, puis contenu, le menu
    // devient un tiroir superposé — voir Sidebar.tsx) ; flex-row à partir de
    // md (menu fixe à gauche, comme avant).
    <div className="flex flex-col md:flex-row min-h-screen bg-navy-50">
      <Sidebar
        userName={session?.user?.name ?? ""}
        userRole={session?.user?.role ?? ""}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
