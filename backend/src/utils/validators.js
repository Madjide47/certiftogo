// ─────────────────────────────────────────────────────────────
// Fonctions de validation des entrées utilisateur.
// ─────────────────────────────────────────────────────────────

/**
 * Normalise un numéro de téléphone : retire les espaces, tirets et points.
 * @param {string} valeur
 * @returns {string}
 */
export function normaliserTelephone(valeur) {
  if (typeof valeur !== 'string') return '';
  return valeur.replace(/[\s.\-()]/g, '').trim();
}

/**
 * Vérifie qu'un numéro de téléphone a un format plausible.
 * Accepte un éventuel préfixe "+" suivi de 8 à 15 chiffres.
 * @param {string} valeur
 * @returns {boolean}
 */
export function estTelephoneValide(valeur) {
  const tel = normaliserTelephone(valeur);
  return /^\+?\d{8,15}$/.test(tel);
}

/**
 * Vérifie qu'un code OTP est composé d'exactement 6 chiffres.
 * @param {string} valeur
 * @returns {boolean}
 */
export function estCodeOtpValide(valeur) {
  return typeof valeur === 'string' && /^\d{6}$/.test(valeur.trim());
}

/** Nettoie une chaîne : trim ; renvoie null si vide. */
export function nettoyerTexte(valeur) {
  if (typeof valeur !== 'string') return valeur == null ? null : String(valeur);
  const v = valeur.trim();
  return v === '' ? null : v;
}

/** Vérifie un email plausible (ou vide/nul autorisé). */
export function estEmailValide(valeur) {
  if (!valeur) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur);
}

/** Vérifie qu'une valeur figure dans une liste autorisée (ou est vide/nulle). */
export function estDansEnum(valeur, valeursAutorisees) {
  if (valeur == null || valeur === '') return true;
  return valeursAutorisees.includes(valeur);
}

/**
 * Vérifie qu'une chaîne est un UUID.
 * Sans ce garde-fou, un identifiant fantaisiste atteint PostgreSQL et
 * déclenche un 22P02 : une faute de saisie deviendrait une erreur serveur.
 */
export function estUuidValide(valeur) {
  return (
    typeof valeur === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valeur.trim())
  );
}

/** Vérifie le format d'un libellé d'année académique : AAAA-AAAA consécutives. */
export function estLibelleAnneeValide(valeur) {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{4}$/.test(valeur.trim())) return false;
  const [debut, fin] = valeur.trim().split('-').map(Number);
  return fin === debut + 1;
}

/** Convertit en entier, ou renvoie null si la valeur n'est pas un entier exploitable. */
export function versEntier(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(valeur);
  return Number.isInteger(n) ? n : null;
}

/** Vérifie qu'une chaîne est une date au format AAAA-MM-JJ et qu'elle existe. */
export function estDateValide(valeur) {
  if (!valeur) return true;
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur.trim())) return false;
  const d = new Date(`${valeur.trim()}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur.trim();
}

/** Valeurs autorisées par les contraintes CHECK du schéma. */
export const SEXES = ['M', 'F'];
export const MENTIONS = ['passable', 'assez_bien', 'bien', 'tres_bien', 'excellent'];
export const TYPES_DIPLOME = ['licence', 'master', 'doctorat', 'certificat', 'bts'];
export const TYPES_ETABLISSEMENT = ['institut', 'universite', 'ecole', 'lycee'];
export const STATUTS_ETABLISSEMENT = ['actif', 'suspendu', 'archive'];
export const ROLES = ['etablissement', 'ministere', 'candidat', 'admin_systeme'];

// ── Référentiel académique (migrations 002 et 003) ────────────────
export const TYPES_SESSION = ['normale', 'rattrapage', 'exceptionnelle'];
export const STATUTS_ANNEE = ['preparation', 'ouverte', 'cloturee'];
export const STATUTS_SESSION = ['preparation', 'ouverte', 'cloturee'];
export const STATUTS_STRUCTURE = ['active', 'archivee'];
export const STATUTS_PROMOTION = ['brouillon', 'ouverte', 'transmise', 'certifiee', 'cloturee'];
export const STATUTS_INSCRIPTION = ['inscrit', 'admis', 'ajourne', 'abandon', 'exclu'];

/**
 * Transitions autorisées du cycle de vie d'une année ou d'une session.
 * Une année clôturée ne se rouvre pas : les diplômes qu'elle a produits
 * sont ancrés sur la blockchain, son périmètre est définitif.
 */
export const TRANSITIONS_ANNEE = {
  preparation: ['ouverte', 'cloturee'],
  ouverte: ['cloturee'],
  cloturee: [],
};

/**
 * Transitions autorisées du cycle de vie d'une promotion.
 * Une promotion avance ; elle ne revient jamais en arrière, sauf pour
 * rouvrir une promotion transmise que le ministère a rejetée.
 */
export const TRANSITIONS_PROMOTION = {
  brouillon: ['ouverte'],
  ouverte: ['brouillon', 'transmise'],
  transmise: ['ouverte', 'certifiee'],
  certifiee: ['cloturee'],
  cloturee: [],
};

/** Statuts dans lesquels la composition d'une promotion peut encore changer. */
export const STATUTS_PROMOTION_MODIFIABLE = ['brouillon', 'ouverte'];
