// ─────────────────────────────────────────────────────────────
// Registre des pages réelles par rôle et par chemin.
// App.jsx l'utilise : un chemin présent ici rend la vraie page, sinon on
// retombe sur un PlaceholderPage — ce qui permet de déclarer une entrée
// de navigation avant que son écran n'existe.
// ─────────────────────────────────────────────────────────────
import DashboardPage from '../pages/etablissement/DashboardPage.jsx';
import CandidatsPage from '../pages/etablissement/CandidatsPage.jsx';
import DossiersPage from '../pages/etablissement/DossiersPage.jsx';
import StructurePage from '../pages/etablissement/StructurePage.jsx';
import PromotionsPage from '../pages/etablissement/PromotionsPage.jsx';
import LotsPage from '../pages/etablissement/LotsPage.jsx';
import AgentsPage from '../pages/etablissement/AgentsPage.jsx';
import JournalPage from '../pages/commun/JournalPage.jsx';
import AnneesAcademiquesPage from '../pages/ministere/AnneesAcademiquesPage.jsx';
import DossiersRecusPage from '../pages/ministere/DossiersRecusPage.jsx';
import MinistereDiplomesPage from '../pages/ministere/DiplomesPage.jsx';
import MinistereDashboardPage from '../pages/ministere/DashboardPage.jsx';
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
    '/structure': StructurePage,
    '/candidats': CandidatsPage,
    '/promotions': PromotionsPage,
    '/lots': LotsPage,
    '/dossiers': DossiersPage,
    '/agents': AgentsPage,
    '/journal': JournalPage,
  },
  ministere: {
    '/': MinistereDashboardPage,
    '/annees': AnneesAcademiquesPage,
    '/dossiers-recus': DossiersRecusPage,
    '/diplomes': MinistereDiplomesPage,
    '/etablissements': MinistereEtablissementsPage,
    '/journal': JournalPage,
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
    '/journal': JournalPage,
    '/configuration': ConfigurationPage,
  },
};

/** Renvoie le composant page pour (rôle, chemin) ou null. */
export function pagePour(role, chemin) {
  return PAGES_PAR_ROLE[role]?.[chemin] || null;
}
