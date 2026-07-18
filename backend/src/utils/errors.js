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

export default ErreurApp;
