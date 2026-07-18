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

/** Extrait un message d'erreur lisible d'une erreur axios. */
export function messageErreur(err, defaut = 'Une erreur est survenue.') {
  return err?.response?.data?.error?.message || defaut;
}
