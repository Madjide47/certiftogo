// ─────────────────────────────────────────────────────────────
// Configuration de la navigation (sidebar) selon le rôle.
// Chaque entrée : { libelle, chemin, icone (emoji simple pour l'instant) }
// ─────────────────────────────────────────────────────────────

export const LIBELLES_ROLES = {
  etablissement: 'Établissement',
  ministere: 'Ministère',
  candidat: 'Candidat',
  admin_systeme: 'Administrateur',
};

// `icone` = nom d'icône Material Symbols (voir composant Icon).
export const NAVIGATION_PAR_ROLE = {
  etablissement: [
    { libelle: 'Tableau de bord', chemin: '/', icone: 'dashboard' },
    { libelle: 'Candidats', chemin: '/candidats', icone: 'group' },
    { libelle: 'Dossiers', chemin: '/dossiers', icone: 'folder' },
    { libelle: 'Statistiques', chemin: '/statistiques', icone: 'bar_chart' },
  ],
  ministere: [
    { libelle: 'Tableau de bord', chemin: '/', icone: 'dashboard' },
    { libelle: 'Dossiers reçus', chemin: '/dossiers-recus', icone: 'inbox' },
    { libelle: 'Diplômes certifiés', chemin: '/diplomes', icone: 'school' },
    { libelle: 'Établissements', chemin: '/etablissements', icone: 'account_balance' },
    { libelle: 'Statistiques', chemin: '/statistiques', icone: 'bar_chart' },
  ],
  candidat: [
    { libelle: 'Portefeuille', chemin: '/', icone: 'account_balance_wallet' },
    { libelle: 'Mes diplômes', chemin: '/mes-diplomes', icone: 'school' },
    { libelle: 'Paramètres', chemin: '/parametres', icone: 'settings' },
  ],
  admin_systeme: [
    { libelle: 'Tableau de bord', chemin: '/', icone: 'dashboard' },
    { libelle: 'Utilisateurs', chemin: '/utilisateurs', icone: 'group' },
    { libelle: 'Établissements', chemin: '/etablissements', icone: 'account_balance' },
    { libelle: 'Configuration', chemin: '/configuration', icone: 'settings' },
  ],
};
