// ─────────────────────────────────────────────────────────────
// Réception de fichiers — multer, et la traduction de ses erreurs.
//
// Multer signale ses refus par des exceptions techniques (`LIMIT_FILE_SIZE`,
// `LIMIT_UNEXPECTED_FILE`…). Laissées telles quelles, elles remontent en
// 500 : l'agent voit « erreur serveur » alors que son fichier est
// simplement trop lourd. Chaque cas est donc traduit en erreur métier
// portant le geste correctif.
// ─────────────────────────────────────────────────────────────
import multer from 'multer';
import { ErreurApp } from '../utils/errors.js';

/** Messages par code multer. Tout code inconnu reste une vraie erreur. */
const TRADUCTIONS = {
  LIMIT_FILE_SIZE: (limite) => [
    413,
    'FICHIER_TROP_VOLUMINEUX',
    `Fichier limité à ${Math.round(limite / (1024 * 1024))} Mo.`,
  ],
  LIMIT_UNEXPECTED_FILE: () => [
    400,
    'CHAMP_FICHIER_INVALIDE',
    'Le fichier doit être envoyé dans le champ « fichier », et un seul à la fois.',
  ],
  LIMIT_FILE_COUNT: () => [400, 'TROP_DE_FICHIERS', 'Un seul fichier par envoi.'],
  LIMIT_PART_COUNT: () => [400, 'REQUETE_INVALIDE', 'Formulaire trop complexe.'],
  LIMIT_FIELD_VALUE: () => [400, 'CHAMP_TROP_LONG', 'Un champ du formulaire est trop long.'],
};

/**
 * Construit un middleware de réception d'un fichier unique.
 *
 * @param {object} options
 * @param {number} options.tailleMax        taille maximale, en octets
 * @param {RegExp} [options.extensions]     extensions acceptées
 * @param {string} [options.champ]          nom du champ de formulaire
 * @param {string} [options.messageFormat]  message si l'extension est refusée
 */
export function recevoirFichier({
  tailleMax,
  extensions,
  champ = 'fichier',
  messageFormat = 'Format de fichier non accepté.',
}) {
  const televersement = multer({
    // En mémoire : le contenu est contrôlé (type, signature, empreinte)
    // AVANT d'atteindre le disque. Écrire d'abord reviendrait à stocker
    // ce qu'on s'apprête à refuser.
    storage: multer.memoryStorage(),
    limits: { fileSize: tailleMax, files: 1 },
    fileFilter: (req, fichier, suite) => {
      if (extensions && !extensions.test(fichier.originalname || '')) {
        return suite(new ErreurApp(415, 'FORMAT_NON_SUPPORTE', messageFormat));
      }
      return suite(null, true);
    },
  });

  return function recevoir(req, res, next) {
    televersement.single(champ)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof ErreurApp) return next(err);

      const traduction = TRADUCTIONS[err.code];
      if (traduction) {
        const [statut, code, message] = traduction(tailleMax);
        return next(new ErreurApp(statut, code, message));
      }

      // Corps multipart tronqué ou malformé : le client a coupé en route.
      if (err instanceof multer.MulterError || /Unexpected end|Boundary/i.test(err.message || '')) {
        return next(
          new ErreurApp(
            400,
            'ENVOI_INTERROMPU',
            "L'envoi du fichier a été interrompu. Réessayez."
          )
        );
      }

      return next(err);
    });
  };
}
