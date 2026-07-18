// ─────────────────────────────────────────────────────────────
// Candidat — tableau de bord du portefeuille : chiffres clés + accès rapide
// à la liste détaillée des diplômes.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listerMesDiplomes, statistiquesPortefeuille } from '../../services/portefeuille.service.js';
import { LIBELLES_TYPE_DIPLOME, messageErreur } from '../../utils/libelles.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';

export default function PortefeuillePage() {
  const [stats, setStats] = useState(null);
  const [recents, setRecents] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    Promise.all([statistiquesPortefeuille(), listerMesDiplomes()])
      .then(([s, d]) => {
        setStats(s);
        setRecents(d.slice(0, 5));
      })
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  return (
    <div>
      <PageHeader titre="Mon portefeuille" sous="Vos diplômes certifiés et vérifiables." />

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      {chargement ? (
        <div className="py-16 text-center text-on-surface-variant">Chargement…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <StatCard libelle="Diplômes" valeur={stats?.total_diplomes ?? 0} icone="school" />
            <StatCard
              libelle="Actifs"
              valeur={stats?.diplomes_par_statut?.actif ?? 0}
              icone="verified"
              accent="text-emerald-600"
            />
            <StatCard
              libelle="Révoqués"
              valeur={stats?.diplomes_par_statut?.revoque ?? 0}
              icone="cancel"
              accent="text-error"
            />
          </div>

          <div className="mt-8 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-on-surface">Diplômes récents</h2>
            <Link to="/mes-diplomes" className="text-sm font-semibold text-primary hover:underline">
              Tout voir →
            </Link>
          </div>

          <Card className="mt-3 overflow-hidden">
            {recents.length === 0 ? (
              <p className="px-5 py-10 text-center text-on-surface-variant">Aucun diplôme certifié.</p>
            ) : (
              <ul>
                {recents.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between border-b border-outline-variant/15 px-5 py-4 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-low text-primary">
                        <Icon name="school" size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-on-surface">
                          {LIBELLES_TYPE_DIPLOME[d.type_diplome] || d.type_diplome}
                        </div>
                        <div className="text-xs text-on-surface-variant">{d.reference}</div>
                      </div>
                    </div>
                    {d.pdf_url && (
                      <a
                        href={d.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        PDF
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
