// ─────────────────────────────────────────────────────────────
// Libellés lisibles et styles de badges pour les énumérations métier.
// (Alignés sur les contraintes CHECK du schéma PostgreSQL.)
// ─────────────────────────────────────────────────────────────

export const LIBELLES_STATUT_DOSSIER = {
  brouillon: 'Brouillon',
  soumis: 'Soumis',
  en_examen: 'En examen',
  valide: 'Validé',
  rejete: 'Rejeté',
  certifie: 'Certifié',
  revoque: 'Révoqué',
};

// Classes Tailwind par statut (fond + texte).
export const BADGE_STATUT_DOSSIER = {
  brouillon: 'bg-slate-100 text-slate-600',
  soumis: 'bg-blue-100 text-blue-700',
  en_examen: 'bg-amber-100 text-amber-700',
  valide: 'bg-emerald-100 text-emerald-700',
  rejete: 'bg-red-100 text-red-700',
  certifie: 'bg-togo-green/10 text-togo-green',
  revoque: 'bg-red-100 text-red-700',
};

export const LIBELLES_STATUT_DIPLOME = {
  actif: 'Actif',
  revoque: 'Révoqué',
};

export const BADGE_STATUT_DIPLOME = {
  actif: 'bg-emerald-100 text-emerald-700',
  revoque: 'bg-red-100 text-red-700',
};

// Couleur de barre de progression par statut de dossier.
export const BAR_STATUT_DOSSIER = {
  brouillon: 'bg-slate-300',
  soumis: 'bg-blue-400',
  en_examen: 'bg-secondary-fixed-dim',
  valide: 'bg-emerald-400',
  rejete: 'bg-error',
  certifie: 'bg-primary-container',
  revoque: 'bg-error',
};

export const LIBELLES_MENTION = {
  passable: 'Passable',
  assez_bien: 'Assez bien',
  bien: 'Bien',
  tres_bien: 'Très bien',
  excellent: 'Excellent',
};

export const LIBELLES_TYPE_DIPLOME = {
  licence: 'Licence',
  master: 'Master',
  doctorat: 'Doctorat',
  certificat: 'Certificat',
  bts: 'BTS',
};

export const OPTIONS_MENTION = Object.entries(LIBELLES_MENTION).map(([value, label]) => ({
  value,
  label,
}));

export const OPTIONS_TYPE_DIPLOME = Object.entries(LIBELLES_TYPE_DIPLOME).map(([value, label]) => ({
  value,
  label,
}));

export const LIBELLES_ROLE = {
  etablissement: 'Établissement',
  ministere: 'Ministère',
  candidat: 'Candidat',
  admin_systeme: 'Administrateur',
};

export const LIBELLES_TYPE_ETABLISSEMENT = {
  institut: 'Institut',
  universite: 'Université',
  ecole: 'École',
  lycee: 'Lycée',
};

export const OPTIONS_TYPE_ETABLISSEMENT = Object.entries(LIBELLES_TYPE_ETABLISSEMENT).map(
  ([value, label]) => ({ value, label })
);

export const LIBELLES_STATUT_ETABLISSEMENT = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  archive: 'Archivé',
};

export const BADGE_STATUT_ETABLISSEMENT = {
  actif: 'bg-emerald-100 text-emerald-700',
  suspendu: 'bg-amber-100 text-amber-700',
  archive: 'bg-slate-100 text-slate-600',
};

// ── Référentiel académique ─────────────────────────────────────────
export const LIBELLES_STATUT_ANNEE = {
  preparation: 'En préparation',
  ouverte: 'Ouverte',
  cloturee: 'Clôturée',
};

export const BADGE_STATUT_ANNEE = {
  preparation: 'bg-slate-100 text-slate-600',
  ouverte: 'bg-emerald-100 text-emerald-700',
  cloturee: 'bg-slate-200 text-slate-700',
};

export const LIBELLES_TYPE_SESSION = {
  normale: 'Normale',
  rattrapage: 'Rattrapage',
  exceptionnelle: 'Exceptionnelle',
};

export const OPTIONS_TYPE_SESSION = Object.entries(LIBELLES_TYPE_SESSION).map(([value, label]) => ({
  value,
  label,
}));

export const LIBELLES_STATUT_STRUCTURE = {
  active: 'Active',
  archivee: 'Archivée',
};

export const BADGE_STATUT_STRUCTURE = {
  active: 'bg-emerald-100 text-emerald-700',
  archivee: 'bg-slate-100 text-slate-600',
};

export const LIBELLES_STATUT_PROMOTION = {
  brouillon: 'Brouillon',
  ouverte: 'Ouverte',
  controle_interne: 'Contrôle interne',
  validee_interne: 'Validée en interne',
  transmise: 'Transmise',
  certifiee: 'Certifiée',
  cloturee: 'Clôturée',
};

export const TON_STATUT_PROMOTION = {
  brouillon: 'neutre',
  ouverte: 'info',
  controle_interne: 'alerte',
  validee_interne: 'succes',
  transmise: 'alerte',
  certifiee: 'vert',
  cloturee: 'neutre',
};

export const OPTIONS_STATUT_PROMOTION = Object.entries(LIBELLES_STATUT_PROMOTION).map(
  ([value, label]) => ({ value, label })
);

/**
 * Transitions proposées à l'écran — miroir de TRANSITIONS_PROMOTION et de
 * TRANSITIONS_INTERNES côté backend. Le serveur reste seul juge : l'interface
 * n'affiche que les actions plausibles, elle ne décide pas.
 *
 * « transmise » n'y figure pas : la transmission passe par son propre
 * endpoint, qui crée le lot et les dossiers.
 */
const ACTIONS_SIMPLE = {
  brouillon: [{ statut: 'ouverte', libelle: 'Ouvrir' }],
  ouverte: [{ statut: 'brouillon', libelle: 'Repasser en brouillon' }],
  transmise: [{ statut: 'ouverte', libelle: 'Rouvrir' }],
  certifiee: [{ statut: 'cloturee', libelle: 'Clôturer' }],
  cloturee: [],
};

const ACTIONS_HIERARCHIQUE = {
  brouillon: [{ statut: 'ouverte', libelle: 'Ouvrir' }],
  ouverte: [
    { statut: 'controle_interne', libelle: 'Envoyer au contrôle' },
    { statut: 'brouillon', libelle: 'Repasser en brouillon' },
  ],
  controle_interne: [
    { statut: 'validee_interne', libelle: 'Valider en interne' },
    { statut: 'ouverte', libelle: 'Renvoyer à la saisie' },
  ],
  validee_interne: [{ statut: 'controle_interne', libelle: 'Renvoyer au contrôle' }],
  transmise: [{ statut: 'ouverte', libelle: 'Rouvrir' }],
  certifiee: [{ statut: 'cloturee', libelle: 'Clôturer' }],
  cloturee: [],
};

export function actionsPromotion(statut, mode = 'simple') {
  const table = mode === 'hierarchique' ? ACTIONS_HIERARCHIQUE : ACTIONS_SIMPLE;
  return table[statut] || [];
}

/** Statut à partir duquel une promotion peut partir au ministère. */
export function transmissiblePromotion(statut, mode = 'simple') {
  return mode === 'hierarchique' ? statut === 'validee_interne' : statut === 'ouverte';
}

export const LIBELLES_STATUT_INSCRIPTION = {
  inscrit: 'Inscrit',
  admis: 'Admis',
  ajourne: 'Ajourné',
  abandon: 'Abandon',
  exclu: 'Exclu',
};

export const TON_STATUT_INSCRIPTION = {
  inscrit: 'info',
  admis: 'succes',
  ajourne: 'alerte',
  abandon: 'neutre',
  exclu: 'erreur',
};

export const OPTIONS_STATUT_INSCRIPTION = Object.entries(LIBELLES_STATUT_INSCRIPTION).map(
  ([value, label]) => ({ value, label })
);

/** Extrait un message d'erreur lisible d'une erreur axios. */
export function messageErreur(err, defaut = 'Une erreur est survenue.') {
  return err?.response?.data?.error?.message || defaut;
}
