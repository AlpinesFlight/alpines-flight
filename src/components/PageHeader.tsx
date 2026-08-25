export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    // min-h-[105px] : même hauteur totale que le bandeau logo de la barre
    // latérale (voir Sidebar.tsx), pour que la bande claire soit au même
    // niveau des deux côtés.
    <div className="flex items-center justify-between px-8 py-6 min-h-[105px] border-b border-navy-100 bg-cream-50">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-navy-900">
          {title}
        </h1>
        {subtitle && <p className="text-navy-600 text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
