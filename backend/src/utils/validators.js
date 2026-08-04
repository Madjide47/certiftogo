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

/** Indicatif par défaut, utilisé quand un numéro est saisi en forme locale. */
export const INDICATIF_PAR_DEFAUT = process.env.INDICATIF_TELEPHONE || '+228';

/**
 * Ramène un numéro à sa forme canonique internationale.
 *
 * Sans cela, « 90 00 00 11 » et « +22890000011 » désignent deux personnes
 * différentes en base : le portefeuille national se fragmente et le même
 * diplômé peut se retrouver avec deux comptes.
 *
 *   "90 00 00 11"   → "+22890000011"
 *   "00228 90000011"→ "+22890000011"
 *   "22890000011"   → "+22890000011"
 *   "+33612345678"  → inchangé (déjà international)
 */
export function canoniserTelephone(valeur, indicatif = INDICATIF_PAR_DEFAUT) {
  const brut = normaliserTelephone(valeur);
  if (!brut) return null;

  if (brut.startsWith('+')) return brut;
  if (brut.startsWith('00')) return `+${brut.slice(2)}`;

  const sansPlus = indicatif.replace('+', '');
  if (brut.startsWith(sansPlus) && brut.length > sansPlus.length) return `+${brut}`;

  // Forme locale : on préfixe par l'indicatif du pays.
  return `${indicatif}${brut}`;
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

/**
 * Ramène un libellé d'année académique à sa forme canonique AAAA-AAAA.
 *
 * Les fichiers et les agents écrivent « 2025/2026 », « 2025 - 2026 »,
 * parfois « 2025 2026 ». Refuser ces formes n'apprend rien à personne :
 * l'intention est limpide. Seul l'enchaînement des années est une vraie
 * règle — 2025-2027 n'est pas une année académique.
 */
export function canoniserLibelleAnnee(valeur) {
  if (typeof valeur !== 'string') return null;
  const m = valeur.trim().match(/^(\d{4})\s*[-/\s]\s*(\d{4})$/);
  if (!m) return null;
  const debut = Number(m[1]);
  const fin = Number(m[2]);
  if (fin !== debut + 1) return null;
  return `${debut}-${fin}`;
}

/** Vérifie le format d'un libellé d'année académique : AAAA-AAAA consécutives. */
export function estLibelleAnneeValide(valeur) {
  return canoniserLibelleAnnee(valeur) !== null;
}

/** Convertit en entier, ou renvoie null si la valeur n'est pas un entier exploitable. */
export function versEntier(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(valeur);
  return Number.isInteger(n) ? n : null;
}

/** Format attendu, cité tel quel dans les messages d'erreur. */
export const FORMATS_DATE_ACCEPTES = 'AAAA-MM-JJ ou JJ/MM/AAAA';

/** Assemble une date en AAAA-MM-JJ, ou null si le jour n'existe pas. */
function assemblerDate(annee, mois, jour) {
  const a = Number(annee);
  const m = Number(mois);
  const j = Number(jour);
  if (!Number.isInteger(a) || !Number.isInteger(m) || !Number.isInteger(j)) return null;
  if (m < 1 || m > 12 || j < 1 || j > 31) return null;

  // Aller-retour par UTC : seul moyen sûr d'éliminer le 31 février.
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return null;

  return d.toISOString().slice(0, 10);
}

/**
 * Ramène une date à sa forme canonique AAAA-MM-JJ, ou null si elle est
 * inexploitable. Renvoie `undefined` pour une valeur absente — l'appelant
 * distingue ainsi « pas de date » de « date incompréhensible ».
 *
 * Les formes acceptées sont celles qu'on rencontre réellement dans les
 * fichiers des établissements :
 *
 *   2000-03-15        forme canonique
 *   2000-03-15T…      horodatage ISO (on ne garde que le jour)
 *   15/03/2000        usage francophone — le jour d'abord
 *   15-03-2000, 15.03.2000
 *   2000/03/15
 *   Date              cellule Excel réellement typée date
 *
 * L'ordre jour-mois est celui de l'usage local : « 03/05/2000 » est lu
 * comme le 3 mai. Interpréter à l'américaine ferait naître des étudiants
 * à une date fausse sans que rien ne le signale.
 */
export function canoniserDate(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return undefined;

  if (valeur instanceof Date) {
    return Number.isNaN(valeur.getTime()) ? null : valeur.toISOString().slice(0, 10);
  }

  const brut = String(valeur).trim();
  if (!brut) return undefined;

  // Année en tête : ISO, éventuellement horodatée.
  let m = brut.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (m) return assemblerDate(m[1], m[2], m[3]);

  // Jour en tête : l'usage francophone.
  m = brut.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return assemblerDate(m[3], m[2], m[1]);

  return null;
}

/**
 * Vérifie qu'une date est exploitable. Tolérante sur la forme, stricte
 * sur l'existence du jour : `canoniserDate` fait foi.
 */
export function estDateValide(valeur) {
  if (!valeur) return true;
  return canoniserDate(valeur) !== null;
}

/** Valeurs autorisées par les contraintes CHECK du schéma. */
export const SEXES = ['M', 'F'];
// MENTIONS et TYPES_DIPLOME ne sont plus ici : ce sont des
// NOMENCLATURES, pas des règles de validation. Elles vivent en base
// (migration 016) et se lisent par `nomenclature.service.js`. Les garder
// en dur ici recréerait la situation qu'on vient de défaire : deux
// sources de vérité, dont l'une refuse ce que l'autre accepte.
export const TYPES_ETABLISSEMENT = ['institut', 'universite', 'ecole', 'lycee'];
export const STATUTS_ETABLISSEMENT = ['actif', 'suspendu', 'archive'];
export const ROLES = ['etablissement', 'ministere', 'candidat', 'admin_systeme'];

// ── Référentiel académique (migrations 002 et 003) ────────────────
export const TYPES_SESSION = ['normale', 'rattrapage', 'exceptionnelle'];
export const STATUTS_ANNEE = ['preparation', 'ouverte', 'cloturee'];
export const STATUTS_SESSION = ['preparation', 'ouverte', 'cloturee'];
export const STATUTS_STRUCTURE = ['active', 'archivee'];
// `controle_interne` et `validee_interne` n'existent qu'en mode
// hiérarchique (voir permissions.service.js), mais restent des statuts
// valides du point de vue de la validation d'entrée.
export const STATUTS_PROMOTION = [
  'brouillon',
  'ouverte',
  'controle_interne',
  'validee_interne',
  'transmise',
  'certifiee',
  'cloturee',
];
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
