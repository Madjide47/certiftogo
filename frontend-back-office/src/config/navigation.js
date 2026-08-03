// ─────────────────────────────────────────────────────────────
// Navigation — hiérarchisée par catégories, comme les portails de
// l'administration togolaise.
//
// Une liste plate de douze entrées oblige l'agent à lire chaque libellé
// pour trouver le sien. Le regroupement par MOMENT DU MÉTIER — préparer,
// transmettre, instruire, superviser — permet de viser directement la
// bonne rubrique.
//
// L'ordre des rubriques suit le déroulé réel du travail, pas
// l'alphabet ni l'ordre de développement.
// ─────────────────────────────────────────────────────────────

export const LIBELLES_ROLES = {
  etablissement: 'Établissement',
  ministere: 'Ministère',
  candidat: 'Diplômé',
  admin_systeme: 'Administration système',
};

export const NAVIGATION_PAR_ROLE = {
  etablissement: [
    {
      rubrique: 'Pilotage',
      entrees: [{ libelle: 'Tableau de bord', chemin: '/', icone: 'dashboard' }],
    },
    {
      rubrique: 'Scolarité',
      entrees: [
        { libelle: 'Structure', chemin: '/structure', icone: 'account_tree' },
        { libelle: 'Étudiants', chemin: '/candidats', icone: 'group' },
        { libelle: 'Promotions', chemin: '/promotions', icone: 'groups' },
      ],
    },
    {
      rubrique: 'Transmission',
      entrees: [
        { libelle: 'Lots transmis', chemin: '/lots', icone: 'outbox' },
        { libelle: 'Dossiers', chemin: '/dossiers', icone: 'folder' },
      ],
    },
    {
      rubrique: 'Administration',
      entrees: [
        { libelle: 'Agents', chemin: '/agents', icone: 'badge' },
        { libelle: 'Journal', chemin: '/journal', icone: 'history' },
      ],
    },
  ],

  ministere: [
    {
      rubrique: 'Pilotage',
      entrees: [{ libelle: 'Tableau de bord', chemin: '/', icone: 'dashboard' }],
    },
    {
      rubrique: 'Instruction',
      entrees: [
        { libelle: 'Lots reçus', chemin: '/lots-recus', icone: 'inbox' },
        { libelle: 'Dossiers', chemin: '/dossiers-recus', icone: 'folder_open' },
        { libelle: 'Validations', chemin: '/validations', icone: 'how_to_reg' },
      ],
    },
    {
      rubrique: 'Certification',
      entrees: [
        { libelle: 'Diplômes', chemin: '/diplomes', icone: 'school' },
        { libelle: "File d'ancrage", chemin: '/ancrage', icone: 'link' },
      ],
    },
    {
      rubrique: 'Référentiel',
      entrees: [
        { libelle: 'Établissements', chemin: '/etablissements', icone: 'account_balance' },
        { libelle: "Demandes d'intégration", chemin: '/demandes', icone: 'assignment_add' },
        { libelle: 'Années académiques', chemin: '/annees', icone: 'calendar_month' },
      ],
    },
    {
      rubrique: 'Supervision',
      entrees: [{ libelle: 'Journal', chemin: '/journal', icone: 'history' }],
    },
  ],

  candidat: [
    {
      rubrique: 'Mon espace',
      entrees: [
        { libelle: 'Portefeuille', chemin: '/', icone: 'account_balance_wallet' },
        { libelle: 'Mes diplômes', chemin: '/mes-diplomes', icone: 'school' },
      ],
    },
    {
      rubrique: 'Mon compte',
      entrees: [
        { libelle: 'Notifications', chemin: '/notifications', icone: 'notifications' },
        { libelle: 'Paramètres', chemin: '/parametres', icone: 'settings' },
      ],
    },
  ],

  admin_systeme: [
    {
      rubrique: 'Supervision',
      entrees: [
        { libelle: 'Tableau de bord', chemin: '/', icone: 'monitor_heart' },
        { libelle: 'Journal', chemin: '/journal', icone: 'history' },
        { libelle: 'Corbeille', chemin: '/corbeille', icone: 'restore_from_trash' },
      ],
    },
    {
      rubrique: 'Comptes',
      entrees: [
        { libelle: 'Utilisateurs', chemin: '/utilisateurs', icone: 'group' },
        { libelle: 'Établissements', chemin: '/etablissements', icone: 'account_balance' },
        { libelle: 'Récupérations', chemin: '/recuperations', icone: 'phonelink_lock' },
      ],
    },
    {
      rubrique: 'Système',
      entrees: [
        { libelle: 'Clés de signature', chemin: '/cles', icone: 'key' },
        { libelle: 'Configuration', chemin: '/configuration', icone: 'settings' },
      ],
    },
  ],
};

/** Toutes les entrées d'un rôle, à plat — pour le routage. */
export function entreesPour(role) {
  return (NAVIGATION_PAR_ROLE[role] || []).flatMap((r) => r.entrees);
}

/** Retrouve la rubrique et l'entrée d'un chemin — pour le fil d'Ariane. */
export function situer(role, chemin) {
  for (const rubrique of NAVIGATION_PAR_ROLE[role] || []) {
    const entree = rubrique.entrees.find((e) => e.chemin === chemin);
    if (entree) return { rubrique: rubrique.rubrique, entree };
  }
  return null;
}
