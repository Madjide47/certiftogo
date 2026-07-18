// ─────────────────────────────────────────────────────────────
// Registre des pages réelles par rôle et par chemin.
// App.jsx utilise ce registre : un chemin présent ici rend la vraie
// page ; sinon on retombe sur un PlaceholderPage.
// ─────────────────────────────────────────────────────────────
import DashboardPage from '../pages/etablissement/DashboardPage.jsx';
import CandidatsPage from '../pages/etablissement/CandidatsPage.jsx';
import DossiersPage from '../pages/etablissement/DossiersPage.jsx';
import StatistiquesPage from '../pages/etablissement/StatistiquesPage.jsx';
import DossiersRecusPage from '../pages/ministere/DossiersRecusPage.jsx';
import MinistereDiplomesPage from '../pages/ministere/DiplomesPage.jsx';
import MinistereDashboardPage from '../pages/ministere/DashboardPage.jsx';
import MinistereStatistiquesPage from '../pages/ministere/StatistiquesPage.jsx';
import MinistereEtablissementsPage from '../pages/ministere/EtablissementsPage.jsx';
import PortefeuillePage from '../pages/candidat/PortefeuillePage.jsx';
import MesDiplomesPage from '../pages/candidat/MesDiplomesPage.jsx';
import ParametresPage from '../pages/candidat/ParametresPage.jsx';
import AdminDashboardPage from '../pages/admin/DashboardPage.jsx';
import UtilisateursPage from '../pages/admin/UtilisateursPage.jsx';
import AdminEtablissementsPage from '../pages/admin/EtablissementsPage.jsx';
import ConfigurationPage from '../pages/admin/ConfigurationPage.jsx';

export const PAGES_PAR_ROLE = {
  etablissement: {
    '/': DashboardPage,
    '/candidats': CandidatsPage,
    '/dossiers': DossiersPage,
    '/statistiques': StatistiquesPage,
  },
  ministere: {
    '/': MinistereDashboardPage,
    '/dossiers-recus': DossiersRecusPage,
    '/diplomes': MinistereDiplomesPage,
    '/etablissements': MinistereEtablissementsPage,
    '/statistiques': MinistereStatistiquesPage,
  },
  candidat: {
    '/': PortefeuillePage,
    '/mes-diplomes': MesDiplomesPage,
    '/parametres': ParametresPage,
  },
  admin_systeme: {
    '/': AdminDashboardPage,
    '/utilisateurs': UtilisateursPage,
    '/etablissements': AdminEtablissementsPage,
    '/configuration': ConfigurationPage,
  },
};

/** Renvoie le composant page pour (rôle, chemin) ou null. */
export function pagePour(role, chemin) {
  return PAGES_PAR_ROLE[role]?.[chemin] || null;
}
