// ─────────────────────────────────────────────────────────────
// Middlewares de gestion centralisée des erreurs et des 404.
// ─────────────────────────────────────────────────────────────
import { logger } from '../utils/logger.js';

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
  // Erreurs métier typées (ErreurAuth, etc.) portent statusCode + code.
  const statusCode = err.statusCode || 500;
  const code = err.code || 'ERREUR_SERVEUR';

  if (statusCode >= 500) {
    logger.error('Erreur serveur :', err.stack || err.message);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode >= 500 ? 'Une erreur interne est survenue.' : err.message,
    },
  });
}
