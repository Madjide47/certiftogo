// ─────────────────────────────────────────────────────────────
// Ministère — tableau de bord : dossiers à instruire et suivi global.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { statistiquesMinistere } from '../../services/ministere.service.js';
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
  const [stats, setStats] = useState({});
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    statistiquesMinistere()
      .then(setStats)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  const g = (s) => stats?.[s] ?? 0;
  const aInstruire = g('soumis') + g('en_examen');
  const total = Object.values(stats || {}).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-on-surface">
          Bonjour {utilisateur?.prenom} 👋
        </h1>
        <p className="mt-1 text-on-surface-variant">
          Instruction et certification des diplômes de tous les établissements.
        </p>
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
            <StatCard libelle="À instruire" valeur={aInstruire} icone="pending_actions" accent="text-secondary" />
            <StatCard libelle="Validés" valeur={g('valide')} icone="task_alt" accent="text-emerald-600" />
            <StatCard libelle="Certifiés" valeur={g('certifie')} icone="workspace_premium" accent="text-primary" />
            <StatCard libelle="Rejetés" valeur={g('rejete')} icone="cancel" accent="text-error" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
            <Card className="p-8 lg:col-span-2">
              <h3 className="font-display text-xl font-bold text-on-surface">Dossiers transmis par statut</h3>
              <div className="mt-6 space-y-5">
                {Object.keys(LIBELLES_STATUT_DOSSIER)
                  .filter((s) => s !== 'brouillon')
                  .map((statut) => {
                    const valeur = g(statut);
                    const pct = total > 0 ? Math.round((valeur / total) * 100) : 0;
                    return (
                      <div key={statut}>
                        <div className="mb-2 flex items-center justify-between">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${BADGE_STATUT_DOSSIER[statut]}`}>
                            {LIBELLES_STATUT_DOSSIER[statut]}
                          </span>
                          <span className="font-display text-lg font-bold text-on-surface">{valeur}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-low">
                          <div className={`h-full rounded-full ${BAR_STATUT_DOSSIER[statut] || 'bg-primary-container'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Card>

            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-8">
              <h3 className="font-display text-xl font-bold text-on-surface">Accès rapides</h3>
              <div className="mt-6 flex flex-col gap-4">
                <Link to="/dossiers-recus" className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/20 bg-white p-6 text-center transition-all hover:border-primary-fixed-dim hover:shadow-soft">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-highest text-primary transition-transform group-hover:scale-110">
                    <Icon name="inbox" filled size={28} />
                  </div>
                  <span className="font-display text-lg font-semibold text-on-surface group-hover:text-primary">Instruire les dossiers</span>
                </Link>
                <Link to="/diplomes" className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/20 bg-white p-6 text-center transition-all hover:border-primary-fixed-dim hover:shadow-soft">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-highest text-primary transition-transform group-hover:scale-110">
                    <Icon name="school" filled size={28} />
                  </div>
                  <span className="font-display text-lg font-semibold text-on-surface group-hover:text-primary">Diplômes certifiés</span>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
