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

/** Valeurs autorisées par les contraintes CHECK du schéma. */
export const SEXES = ['M', 'F'];
export const MENTIONS = ['passable', 'assez_bien', 'bien', 'tres_bien', 'excellent'];
export const TYPES_DIPLOME = ['licence', 'master', 'doctorat', 'certificat', 'bts'];
export const TYPES_ETABLISSEMENT = ['institut', 'universite', 'ecole', 'lycee'];
export const STATUTS_ETABLISSEMENT = ['actif', 'suspendu', 'archive'];
export const ROLES = ['etablissement', 'ministere', 'candidat', 'admin_systeme'];
