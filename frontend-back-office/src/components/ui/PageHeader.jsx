// En-tête de page : titre (Manrope), sous-titre, actions à droite.
export default function PageHeader({ titre, sous, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-on-surface">
          {titre}
        </h1>
        {sous && <p className="mt-1 text-on-surface-variant">{sous}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
