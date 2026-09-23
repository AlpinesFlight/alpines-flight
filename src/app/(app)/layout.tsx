import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { InstallHint } from "@/components/InstallHint";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="min-h-screen flex flex-col bg-navy-50">
      <InstallHint />
      {/* flex-col en dessous de md (barre du haut, puis contenu, le menu
      devient un tiroir superposé — voir Sidebar.tsx) ; flex-row à partir de
      md (menu fixe à gauche, comme avant). flex-1 : occupe tout le reste de
      la hauteur sous le bandeau d'installation iOS. */}
      <div className="flex flex-col md:flex-row flex-1">
        <Sidebar
          userName={session?.user?.name ?? ""}
          userRole={session?.user?.role ?? ""}
          isPilot={session?.user?.isPilot}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
