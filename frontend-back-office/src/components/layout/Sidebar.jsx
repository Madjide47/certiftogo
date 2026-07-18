// ─────────────────────────────────────────────────────────────
// Barre latérale dynamique (design system) : dégradé vert institutionnel,
// navigation par rôle avec icônes Material Symbols et accent jaune actif,
// profil utilisateur + déconnexion en pied.
// ─────────────────────────────────────────────────────────────
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { NAVIGATION_PAR_ROLE, LIBELLES_ROLES } from '../../config/navigation.js';
import Icon from '../ui/Icon.jsx';
import Avatar from '../ui/Avatar.jsx';

export default function Sidebar() {
  const { utilisateur, deconnecter } = useAuth();
  const entrees = NAVIGATION_PAR_ROLE[utilisateur?.role] || [];

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-primary to-primary-container text-on-primary shadow-xl">
      {/* Marque */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-fixed text-primary">
          <Icon name="verified" filled />
        </div>
        <div className="leading-tight">
          <div className="font-display text-lg font-extrabold">CertifTOGO</div>
          <div className="text-xs text-on-primary/70">
            {LIBELLES_ROLES[utilisateur?.role]}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {entrees.map((entree) => (
          <NavLink key={entree.chemin} to={entree.chemin} end={entree.chemin === '/'}>
            {({ isActive }) => (
              <span
                className={`flex items-center gap-3 rounded-xl border-l-4 px-4 py-3 text-sm transition-all ${
                  isActive
                    ? 'border-secondary-fixed bg-white/10 font-semibold text-on-primary'
                    : 'border-transparent font-medium text-on-primary/70 hover:bg-white/5 hover:text-on-primary'
                }`}
              >
                <Icon name={entree.icone} filled={isActive} size={22} />
                {entree.libelle}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Profil + déconnexion */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar prenom={utilisateur?.prenom} nom={utilisateur?.nom} size={38} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-on-primary">
              {utilisateur?.prenom} {utilisateur?.nom}
            </div>
            <div className="truncate text-xs text-on-primary/60">{utilisateur?.telephone}</div>
          </div>
          <button
            onClick={deconnecter}
            title="Déconnexion"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-on-primary/70 transition-colors hover:bg-white/10 hover:text-on-primary"
          >
            <Icon name="logout" size={20} />
          </button>
        </div>
      </div>
    </aside>
  );
}
