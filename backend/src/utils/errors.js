// ─────────────────────────────────────────────────────────────
// Erreur métier générique portant un code HTTP et un code applicatif.
// Interceptée par le middleware `gestionErreurs` (statusCode + code).
// ─────────────────────────────────────────────────────────────

export class ErreurApp extends Error {
  /**
   * @param {number} statusCode - code HTTP (400, 403, 404, 409…)
   * @param {string} code - code applicatif (ex: 'CANDIDAT_INTROUVABLE')
   * @param {string} message - message lisible destiné au client
   */
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────
// Traduction des erreurs PostgreSQL en erreurs métier.
//
// Sans cela, une contrainte violée remonte en 500 avec un message
// technique : l'appelant ne sait pas que c'est SA requête qui est
// fautive, et le message expose la structure de la base.
// ─────────────────────────────────────────────────────────────

/** SQLSTATE PostgreSQL → réponse par défaut, quand la contrainte n'est pas reconnue. */
const ERREURS_SQL = {
  23505: [409, 'CONFLIT_UNICITE', 'Cet enregistrement existe déjà.'],
  23503: [409, 'REFERENCE_INVALIDE', 'Référence inexistante, ou des données dépendent de cet enregistrement.'],
  23514: [400, 'REGLE_METIER_VIOLEE', 'Les données ne respectent pas une règle métier.'],
  23502: [400, 'CHAMP_REQUIS', 'Un champ obligatoire est manquant.'],
  '22P02': [400, 'FORMAT_INVALIDE', 'Identifiant ou valeur au format invalide.'],
  22001: [400, 'VALEUR_TROP_LONGUE', 'Une valeur dépasse la longueur autorisée.'],
  22003: [400, 'VALEUR_HORS_LIMITES', 'Une valeur numérique est hors des limites autorisées.'],
  22007: [400, 'DATE_INVALIDE', 'Format de date invalide.'],
  22008: [400, 'DATE_INVALIDE', 'Date hors des limites autorisées.'],
};

/**
 * Convertit une erreur du driver `pg` en ErreurApp exploitable par le client.
 *
 * @param {Error & {code?: string, constraint?: string}} err
 * @param {Record<string, [number, string, string]>} [parContrainte]
 *   Correspondance contrainte/index → [statusCode, code, message], pour
 *   produire un message métier précis plutôt que le libellé générique.
 * @returns {Error} une ErreurApp si l'erreur est reconnue, l'erreur d'origine sinon.
 */
export function traduireErreurSql(err, parContrainte = {}) {
  if (err instanceof ErreurApp) return err;

  // Le nom de la contrainte (ou de l'index unique) est le signal le plus précis.
  const specifique = err?.constraint && parContrainte[err.constraint];
  if (specifique) return new ErreurApp(...specifique);

  const generique = ERREURS_SQL[err?.code];
  if (generique) return new ErreurApp(...generique);

  return err;
}

/**
 * Exécute une opération base de données en traduisant ses erreurs.
 * @param {() => Promise<any>} operation
 * @param {Record<string, [number, string, string]>} [parContrainte]
 */
export async function avecErreursSql(operation, parContrainte = {}) {
  try {
    return await operation();
  } catch (err) {
    throw traduireErreurSql(err, parContrainte);
  }
}

export default ErreurApp;
