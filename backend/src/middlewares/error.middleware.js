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

/**
 * Erreurs levées par les middlewares d'Express eux-mêmes, avant toute
 * ligne de code métier. Sans cette table, un corps JSON mal formé ou un
 * envoi trop volumineux ressort en « erreur interne » — le client croit
 * le serveur en panne alors que c'est sa requête qui est fautive.
 */
function traduireErreurTechnique(err) {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return { statusCode: 400, code: 'CORPS_INVALIDE', message: 'Corps de requête JSON illisible.' };
  }
  if (err?.type === 'entity.too.large') {
    return { statusCode: 413, code: 'CORPS_TROP_VOLUMINEUX', message: 'Requête trop volumineuse.' };
  }
  if (err?.type === 'encoding.unsupported') {
    return { statusCode: 415, code: 'ENCODAGE_NON_SUPPORTE', message: 'Encodage non supporté.' };
  }
  if (/CORS/i.test(err?.message || '')) {
    return {
      statusCode: 403,
      code: 'ORIGINE_NON_AUTORISEE',
      message: "Origine non autorisée par la politique CORS du serveur.",
    };
  }
  // Le client a coupé la connexion : rien à répondre, rien à alerter.
  if (['ECONNRESET', 'ECONNABORTED', 'EPIPE'].includes(err?.code)) {
    return { statusCode: 499, code: 'CLIENT_DECONNECTE', message: 'Requête interrompue.' };
  }
  return null;
}

/** Gestionnaire d'erreurs central (dernier middleware monté). */
// eslint-disable-next-line no-unused-vars
export function gestionErreurs(err, req, res, next) {
  // La réponse est déjà partie (téléchargement d'une pièce, export CSV) :
  // écrire dessus lèverait une seconde erreur. Express sait fermer.
  if (res.headersSent) {
    logger.error('Erreur après envoi des en-têtes :', err?.stack || err?.message);
    return res.destroy();
  }

  // Ordre voulu :
  //   1. les erreurs techniques d'Express — body-parser pose déjà un
  //      `statusCode` mais aucun code métier : les laisser passer pour
  //      « typées » produirait une réponse au code indéfini ;
  //   2. nos erreurs métier, reconnaissables à leur couple statusCode+code ;
  //   3. filet SQL : une contrainte PostgreSQL non traitée devient une
  //      erreur métier plutôt qu'un 500 exposant le schéma.
  const technique = traduireErreurTechnique(err);
  const typee = err?.statusCode && err?.code ? err : null;
  const erreur = technique || typee || traduireErreurSql(err);

  // Erreurs métier typées (ErreurApp, ErreurAuth…) portent statusCode + code.
  const statusCode = erreur.statusCode || 500;
  const code = erreur.statusCode ? erreur.code : 'ERREUR_SERVEUR';

  if (statusCode >= 500) {
    // On journalise l'erreur d'origine, jamais sa traduction.
    logger.error('Erreur serveur :', err.stack || err.message);
  }

  // 499 est un code de journalisation : le client est parti, personne ne
  // lira la réponse. On ferme sans écrire.
  if (statusCode === 499) return res.destroy();

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode >= 500 ? 'Une erreur interne est survenue.' : erreur.message,
    },
  });
}
