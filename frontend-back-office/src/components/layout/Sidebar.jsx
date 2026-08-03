// ─────────────────────────────────────────────────────────────
// Navigation latérale — hiérarchisée par rubriques.
//
// Une liste plate de douze entrées oblige l'agent à lire chaque libellé
// pour trouver le sien. Le regroupement par moment du métier — préparer,
// transmettre, instruire, superviser — permet de viser la bonne rubrique
// du premier coup d'œil.
// ─────────────────────────────────────────────────────────────
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { NAVIGATION_PAR_ROLE, LIBELLES_ROLES } from '../../config/navigation.js';
import { Icone } from '../ui/index.jsx';

export default function Sidebar() {
  const { utilisateur } = useAuth();
  const rubriques = NAVIGATION_PAR_ROLE[utilisateur?.role] || [];

  return (
    <nav
      aria-label="Navigation principale"
      className="sans-impression hidden w-64 shrink-0 border-r border-gris-300 bg-white lg:block"
    >
      <p className="border-b border-gris-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gris-500">
        Espace {LIBELLES_ROLES[utilisateur?.role]}
      </p>

      <div className="py-2">
        {rubriques.map((rubrique) => (
          <div key={rubrique.rubrique} className="mb-3">
            <p className="px-4 py-1 text-xs font-bold uppercase tracking-wide text-gris-500">
              {rubrique.rubrique}
            </p>
            <ul>
              {rubrique.entrees.map((entree) => (
                <li key={entree.chemin}>
                  <NavLink to={entree.chemin} end={entree.chemin === '/'}>
                    {({ isActive }) => (
                      <span
                        className={`flex items-center gap-2.5 border-l-4 px-4 py-2 text-base ${
                          isActive
                            ? 'border-vert bg-vert-clair font-bold text-vert-fonce'
                            : 'border-transparent text-gris-700 hover:bg-gris-100'
                        }`}
                      >
                        <Icone
                          nom={entree.icone}
                          taille={20}
                          className={isActive ? 'filled' : ''}
                        />
                        {entree.libelle}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
