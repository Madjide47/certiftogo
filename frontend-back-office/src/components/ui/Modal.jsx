// ─────────────────────────────────────────────────────────────
// Fenêtre modale générique (overlay flou + panneau centré).
// ─────────────────────────────────────────────────────────────
import Icon from './Icon.jsx';

export default function Modal({ ouvert, titre, onFermer, children, largeur = 'max-w-lg' }) {
  if (!ouvert) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4 backdrop-blur-sm"
      onClick={onFermer}
    >
      <div
        className={`w-full ${largeur} overflow-hidden rounded-2xl bg-white shadow-soft-md`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-outline-variant/25 px-6 py-4">
          <h2 className="font-display text-lg font-bold text-on-surface">{titre}</h2>
          <button
            onClick={onFermer}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-low"
            aria-label="Fermer"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
