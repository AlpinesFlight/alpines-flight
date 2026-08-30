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
    // md:min-h-[105px] : même hauteur totale que le bandeau logo de la barre
    // latérale (voir Sidebar.tsx), pour que la bande claire soit au même
    // niveau des deux côtés — seulement à partir de md, puisqu'en dessous ce
    // bandeau-là est remplacé par la barre du haut mobile (plus fine), donc
    // rien à aligner. flex-wrap : sur un très petit écran, si le titre et
    // l'action ne tiennent pas sur une ligne, l'action passe dessous plutôt
    // que de déborder ou d'écraser le titre.
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-5 md:px-8 md:py-6 md:min-h-[105px] border-b border-navy-100 bg-cream-50">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl md:text-2xl font-bold text-navy-900">
          {title}
        </h1>
        {subtitle && <p className="text-navy-600 text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
