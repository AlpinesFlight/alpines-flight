import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen bg-navy-50">
      <Sidebar
        userName={session?.user?.name ?? ""}
        userRole={session?.user?.role ?? ""}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
