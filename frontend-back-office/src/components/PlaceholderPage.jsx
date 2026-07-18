// ─────────────────────────────────────────────────────────────
// Page générique "à venir" — utilisée pour tous les placeholders
// de la Phase 1 (les pages réelles arrivent dans les phases suivantes).
// ─────────────────────────────────────────────────────────────
export default function PlaceholderPage({ titre, description }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800">{titre}</h1>
      <p className="mt-2 text-slate-500">
        {description || 'Cette page sera implémentée dans une phase ultérieure.'}
      </p>
      <div className="mt-6 rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center text-slate-400">
        🚧 Contenu à venir
      </div>
    </div>
  );
}
