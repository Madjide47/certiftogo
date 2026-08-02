// ─────────────────────────────────────────────────────────────
// Middlewares de gestion centralisée des erreurs et des 404.
// ─────────────────────────────────────────────────────────────
import { logger } from '../utils/logger.js';
import { traduireErreurSql } from '../utils/errors.js';

/** Route inexistante → 404 au format JSON standard. */
export function nonTrouve(req, res) {
  return res.status(404).json({
    success: false,
    error: { code: 'ROUTE_INTROUVABLE', message: `Route ${req.method} ${req.originalUrl} introuvable.` },
  });
}

/** Gestionnaire d'erreurs central (dernier middleware monté). */
// eslint-disable-next-line no-unused-vars
export function gestionErreurs(err, req, res, next) {
  // Filet de sécurité : une contrainte PostgreSQL qui remonte jusqu'ici sans
  // avoir été traitée devient une erreur métier plutôt qu'un 500 exposant le
  // schéma. Les erreurs déjà typées (statusCode présent) ne sont pas touchées.
  const erreur = err?.statusCode ? err : traduireErreurSql(err);

  // Erreurs métier typées (ErreurApp, ErreurAuth…) portent statusCode + code.
  const statusCode = erreur.statusCode || 500;
  const code = erreur.statusCode ? erreur.code : 'ERREUR_SERVEUR';

  if (statusCode >= 500) {
    // On journalise l'erreur d'origine, jamais sa traduction.
    logger.error('Erreur serveur :', err.stack || err.message);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode >= 500 ? 'Une erreur interne est survenue.' : erreur.message,
    },
  });
}
