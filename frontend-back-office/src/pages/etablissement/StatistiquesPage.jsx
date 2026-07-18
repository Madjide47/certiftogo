// ─────────────────────────────────────────────────────────────
// Statistiques établissement : répartition détaillée des dossiers.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { statistiquesEtablissement } from '../../services/statistiques.service.js';
import {
  LIBELLES_STATUT_DOSSIER,
  BADGE_STATUT_DOSSIER,
  BAR_STATUT_DOSSIER,
  messageErreur,
} from '../../utils/libelles.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';

export default function StatistiquesPage() {
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
      <PageHeader titre="Statistiques" sous="Répartition des dossiers de votre établissement." />

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      {chargement ? (
        <div className="py-16 text-center text-on-surface-variant">Chargement…</div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <StatCard libelle="Total candidats" valeur={stats?.total_candidats ?? 0} icone="group" />
            <StatCard libelle="Total dossiers" valeur={total} icone="folder" />
          </div>

          <Card className="p-8">
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
                      <span className="text-sm text-on-surface-variant">
                        {valeur} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-low">
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
        </div>
      )}
    </div>
  );
}
