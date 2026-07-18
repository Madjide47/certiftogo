// ─────────────────────────────────────────────────────────────
// Admin système — tableau de bord : compteurs globaux de la plateforme.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { statistiquesAdmin } from '../../services/admin.service.js';
import { messageErreur } from '../../utils/libelles.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    statistiquesAdmin()
      .then(setStats)
      .catch((err) => setErreur(messageErreur(err)))
      .finally(() => setChargement(false));
  }, []);

  return (
    <div>
      <PageHeader titre="Tableau de bord" sous="Vue d'ensemble de la plateforme CertifTOGO." />

      {erreur && (
        <div className="mb-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {erreur}
        </div>
      )}

      {chargement ? (
        <div className="py-16 text-center text-on-surface-variant">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            libelle="Utilisateurs"
            valeur={stats?.utilisateurs ?? 0}
            icone="group"
            sous={`${stats?.utilisateurs_actifs ?? 0} actif(s)`}
          />
          <StatCard
            libelle="Établissements"
            valeur={stats?.etablissements ?? 0}
            icone="account_balance"
            sous={`${stats?.etablissements_actifs ?? 0} actif(s)`}
          />
          <StatCard libelle="Candidats" valeur={stats?.candidats ?? 0} icone="badge" />
          <StatCard libelle="Dossiers" valeur={stats?.dossiers ?? 0} icone="folder" />
          <StatCard
            libelle="Diplômes"
            valeur={stats?.diplomes ?? 0}
            icone="school"
            sous={`${stats?.diplomes_actifs ?? 0} actif(s) · ${stats?.diplomes_revoques ?? 0} révoqué(s)`}
          />
          <StatCard libelle="Vérifications" valeur={stats?.verifications ?? 0} icone="fact_check" />
        </div>
      )}
    </div>
  );
}
