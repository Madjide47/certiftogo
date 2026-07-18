// Carte d'indicateur : libellé, grand nombre, pastille d'icône + motif décoratif.
import Icon from './Icon.jsx';

export default function StatCard({ libelle, valeur, icone, sous, accent }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-white p-6 shadow-soft transition-shadow hover:shadow-soft-md">
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-surface-container-low opacity-60 transition-transform group-hover:scale-110" />
      <div className="relative z-10 flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          {libelle}
        </span>
        {icone && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-low text-primary-container">
            <Icon name={icone} />
          </div>
        )}
      </div>
      <div
        className={`relative z-10 mt-4 font-display text-[40px] font-extrabold leading-none ${
          accent || 'text-on-surface'
        }`}
      >
        {valeur}
      </div>
      {sous && <div className="relative z-10 mt-2 text-xs text-on-surface-variant">{sous}</div>}
    </div>
  );
}
