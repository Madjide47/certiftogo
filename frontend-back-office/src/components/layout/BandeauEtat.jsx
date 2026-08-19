// ─────────────────────────────────────────────────────────────
// Bandeau d'État — convention constante des portails togolais.
//
// Il porte l'autorité émettrice et la devise nationale. Sa sobriété est
// voulue : c'est un marqueur institutionnel, pas une bannière.
// ─────────────────────────────────────────────────────────────

export default function BandeauEtat() {
  return (
    <div className="border-b-2 border-jaune bg-vert-fonce text-white">
      <div className="mx-auto flex max-w-contenu flex-wrap items-center justify-between gap-2 px-5 py-1.5 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-wide">République Togolaise</p>
        <p className="text-xs text-white/80">Travail · Liberté · Patrie</p>
      </div>
    </div>
  );
}
