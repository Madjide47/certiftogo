// ─────────────────────────────────────────────────────────────
// Tableau de bord établissement : indicateurs clés + accès rapides.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { statistiquesEtablissement } from '../../services/statistiques.service.js';
import {
  LIBELLES_STATUT_DOSSIER,
  BADGE_STATUT_DOSSIER,
  BAR_STATUT_DOSSIER,
  messageErreur,
} from '../../utils/libelles.js';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';

export default function DashboardPage() {
  const { utilisateur } = useAuth();
  const [stats, setStats] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    statistiquesEtablissement()
      .then(setStats)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  const parStatut = stats?.dossiers_par_statut || {};
  const total = stats?.total_dossiers || 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-on-surface">
          Bonjour {utilisateur?.prenom} 👋
        </h1>
        <p className="mt-1 text-on-surface-variant">Vue d'ensemble de votre établissement.</p>
      </div>

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      {chargement ? (
        <div className="py-16 text-center text-on-surface-variant">Chargement…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard libelle="Candidats" valeur={stats?.total_candidats ?? 0} icone="group" />
            <StatCard libelle="Dossiers" valeur={total} icone="folder" />
            <StatCard libelle="Brouillons" valeur={parStatut.brouillon ?? 0} icone="draft" />
            <StatCard libelle="Soumis" valeur={parStatut.soumis ?? 0} icone="task_alt" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Répartition par statut */}
            <Card className="p-8 lg:col-span-2">
              <h3 className="font-display text-xl font-bold text-on-surface">Dossiers par statut</h3>
              <div className="mt-6 space-y-5">
                {Object.entries(parStatut).map(([statut, valeur]) => {
                  const pct = total > 0 ? Math.round((valeur / total) * 100) : 0;
                  return (
                    <div key={statut}>
                      <div className="mb-2 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${BADGE_STATUT_DOSSIER[statut]}`}
                        >
                          {LIBELLES_STATUT_DOSSIER[statut]}
                        </span>
                        <span className="font-display text-lg font-bold text-on-surface">
                          {valeur}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-low">
                        <div
                          className={`h-full rounded-full ${BAR_STATUT_DOSSIER[statut] || 'bg-primary-container'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Accès rapides */}
            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-8">
              <h3 className="font-display text-xl font-bold text-on-surface">Accès rapides</h3>
              <div className="mt-6 flex flex-col gap-4">
                <AccesRapide to="/candidats" icone="groups" libelle="Gérer les candidats" />
                <AccesRapide to="/dossiers" icone="snippet_folder" libelle="Gérer les dossiers" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AccesRapide({ to, icone, libelle }) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/20 bg-white p-6 text-center transition-all hover:border-primary-fixed-dim hover:shadow-soft"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-highest text-primary transition-transform group-hover:scale-110">
        <Icon name={icone} filled size={28} />
      </div>
      <span className="font-display text-lg font-semibold text-on-surface group-hover:text-primary">
        {libelle}
      </span>
    </Link>
  );
}
