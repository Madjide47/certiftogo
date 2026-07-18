// ─────────────────────────────────────────────────────────────
// Avatar à initiales (les comptes n'ont pas de photo).
// ─────────────────────────────────────────────────────────────
function initiales(prenom = '', nom = '') {
  const a = (prenom || '').trim()[0] || '';
  const b = (nom || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

export default function Avatar({ prenom, nom, size = 40, className = '' }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-white/10 font-semibold text-on-primary ring-2 ring-white/20 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initiales(prenom, nom)}
    </div>
  );
}
