// ─────────────────────────────────────────────────────────────
// En-tête de service : identité de l'application, notifications, compte.
//
// L'identité de l'agent est ICI, pas au fond d'une barre latérale : sur
// un système où chaque acte est tracé nominativement, l'agent doit voir
// en permanence sous quelle identité il travaille.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { LIBELLES_ROLES } from '../../config/navigation.js';
import { Icone } from '../ui/index.jsx';
import { compterNonLues } from '../../services/notification.service.js';

const SOUS_ROLES = {
  agent_saisie: 'Agent de saisie',
  chef_scolarite: 'Chef de scolarité',
  directeur: 'Directeur',
};

export default function Header() {
  const { utilisateur, deconnecter } = useAuth();
  const [nonLues, setNonLues] = useState(0);

  useEffect(() => {
    let vivant = true;
    compterNonLues()
      .then((n) => vivant && setNonLues(n))
      .catch(() => {
        /* le compteur n'est pas critique : on ne casse pas l'en-tête */
      });
    return () => {
      vivant = false;
    };
  }, []);

  const identite = [utilisateur?.prenom, utilisateur?.nom].filter(Boolean).join(' ');

  return (
    <header className="border-b border-gris-300 bg-white">
      <div className="mx-auto flex max-w-contenu flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center bg-vert text-white">
            <Icone nom="verified" taille={20} className="filled" />
          </span>
          <span>
            <span className="block text-lg font-bold leading-tight text-gris-900">CertifTOGO</span>
            <span className="block text-xs text-gris-500">
              Certification et traçabilité des diplômes
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-3 sans-impression">
          <Link
            to="/notifications"
            className="relative flex items-center gap-1.5 rounded border border-gris-300 px-2.5 py-1.5 text-sm text-gris-700 hover:bg-gris-100"
          >
            <Icone nom="notifications" taille={18} />
            <span className="hidden sm:inline">Notifications</span>
            {nonLues > 0 && (
              <span className="tabulaire rounded-full bg-erreur px-1.5 text-xs font-bold text-white">
                {nonLues > 99 ? '99+' : nonLues}
              </span>
            )}
          </Link>

          <div className="hidden border-l border-gris-300 pl-3 sm:block">
            <p className="text-sm font-medium text-gris-900">{identite || '—'}</p>
            <p className="text-xs text-gris-500">
              {LIBELLES_ROLES[utilisateur?.role]}
              {utilisateur?.sous_role && ` · ${SOUS_ROLES[utilisateur.sous_role] || utilisateur.sous_role}`}
            </p>
          </div>

          <button
            type="button"
            onClick={deconnecter}
            className="flex items-center gap-1.5 rounded border border-gris-300 px-2.5 py-1.5 text-sm text-gris-700 hover:bg-gris-100"
          >
            <Icone nom="logout" taille={18} />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}
