// ─────────────────────────────────────────────────────────────
// Navigation repliable — la même, en dessous de 1024 px.
//
// PROBLÈME RÉSOLU
// La barre latérale était `hidden lg:block` : sous 1024 px elle
// disparaissait SANS REMPLACEMENT. Un agent sur téléphone — le cas
// courant dans une scolarité togolaise, où l'ordinateur est partagé et
// le téléphone personnel — n'avait plus aucun moyen d'atteindre un
// écran autre que celui où il se trouvait. Ce n'était pas une gêne
// d'affichage : c'était une application inutilisable.
//
// Le tiroir reprend EXACTEMENT les rubriques de la barre latérale, à
// partir de la même source (`NAVIGATION_PAR_ROLE`). Deux navigations
// entretenues séparément finissent toujours par diverger, et c'est
// celle qu'on regarde le moins qui se périme.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { NAVIGATION_PAR_ROLE, LIBELLES_ROLES } from '../../config/navigation.js';
import { Icone } from '../ui/index.jsx';

export default function NavigationMobile({ ouvert, onFermer }) {
  const { utilisateur } = useAuth();
  const rubriques = NAVIGATION_PAR_ROLE[utilisateur?.role] || [];
  const panneau = useRef(null);

  // Échap referme : un tiroir qui ne se ferme qu'au clic piège l'agent
  // au clavier sur le seul élément de la page qui reste atteignable.
  useEffect(() => {
    if (!ouvert) return undefined;
    const auClavier = (e) => {
      if (e.key === 'Escape') onFermer();
    };
    document.addEventListener('keydown', auClavier);
    panneau.current?.focus();
    return () => document.removeEventListener('keydown', auClavier);
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  return (
    <div
      className="sans-impression fixed inset-0 z-40 bg-gris-900/50 lg:hidden"
      onClick={onFermer}
      role="presentation"
    >
      <nav
        ref={panneau}
        tabIndex={-1}
        aria-label="Navigation principale"
        className="h-full w-72 max-w-[85%] overflow-y-auto border-r border-gris-300 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gris-200 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gris-500">
            Espace {LIBELLES_ROLES[utilisateur?.role]}
          </p>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer la navigation"
            className="rounded border border-gris-300 p-1 text-gris-700 hover:bg-gris-100"
          >
            <Icone nom="close" taille={20} />
          </button>
        </div>

        <div className="py-2">
          {rubriques.map((rubrique) => (
            <div key={rubrique.rubrique} className="mb-3">
              <p className="px-4 py-1 text-xs font-bold uppercase tracking-wide text-gris-500">
                {rubrique.rubrique}
              </p>
              <ul>
                {rubrique.entrees.map((entree) => (
                  <li key={entree.chemin}>
                    {/* Le tiroir se referme à la navigation : le laisser
                        ouvert masquerait la page qu'on vient d'ouvrir. */}
                    <NavLink to={entree.chemin} end={entree.chemin === '/'} onClick={onFermer}>
                      {({ isActive }) => (
                        <span
                          className={`flex items-center gap-2.5 border-l-4 px-4 py-2.5 text-base ${
                            isActive
                              ? 'border-vert bg-vert-clair font-bold text-vert-fonce'
                              : 'border-transparent text-gris-700 hover:bg-gris-100'
                          }`}
                        >
                          <Icone nom={entree.icone} taille={20} className={isActive ? 'filled' : ''} />
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
    </div>
  );
}
