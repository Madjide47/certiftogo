// ─────────────────────────────────────────────────────────────
// Routes "demandes d'intégration" — /api/demandes-integration
//
// PUBLIQUES, et c'est volontaire : un établissement qui souhaite
// rejoindre la plateforme n'a par définition pas encore de compte.
// Le dépôt d'une demande ne crée aucun accès — seul le ministère peut
// transformer une demande en établissement.
//
// Le dossier se constitue en deux temps : le formulaire ouvre un
// BROUILLON et rend un jeton, les pièces s'y joignent, puis la
// transmission le fait entrer dans la file du ministère. Toutes les
// opérations sur un brouillon exigent le jeton — la référence seule se
// devine, elle ne peut pas tenir lieu de secret.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as gouvernanceController from '../controllers/gouvernance.controller.js';
import * as pieceController from '../controllers/piece-demande.controller.js';
import * as nomenclature from '../services/nomenclature.service.js';
import { TAILLE_MAX_OCTETS } from '../services/piece-demande.service.js';
import {
  limiteDemandeIntegration,
  limitePiecesDemande,
} from '../middlewares/rate-limit.middleware.js';
import { recevoirFichier } from '../middlewares/televersement.middleware.js';

const router = Router();

const recevoirPiece = recevoirFichier({
  tailleMax: TAILLE_MAX_OCTETS,
  extensions: /\.(pdf|jpe?g|png|xlsx)$/i,
  messageFormat: 'Formats acceptés : PDF, JPEG, PNG, XLSX.',
});

router.post('/', limiteDemandeIntegration, gouvernanceController.deposerDemande);

// ── Chemins fixes AVANT /:reference, sinon le paramètre les absorbe ──

/**
 * Types de diplôme habilitables — le formulaire public en a besoin, et
 * son auteur n'a pas de compte pour lire `/api/referentiel/nomenclatures`.
 * La liste des diplômes reconnus par l'État figure au Journal officiel :
 * rien de confidentiel.
 */
router.get('/types-diplome', async (req, res, next) => {
  try {
    const types = await nomenclature.typesDiplome({ actifsSeuls: true });
    return res.json({ success: true, data: { types_diplome: types } });
  } catch (err) {
    return next(err);
  }
});

/** Catalogue des pièces exigées : libellés, obligation, formats. */
router.get('/pieces/catalogue', pieceController.catalogue);

// ── Constitution du dossier (jeton exigé) ──────────────────────────
router.get('/:reference/pieces', pieceController.lister);
router.post(
  '/:reference/pieces',
  limitePiecesDemande,
  recevoirPiece,
  pieceController.deposer
);
router.delete('/:reference/pieces/:id', pieceController.supprimer);
router.post('/:reference/transmettre', gouvernanceController.transmettreDemande);

router.get('/:reference', gouvernanceController.suivreDemande);

export default router;
