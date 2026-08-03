// ─────────────────────────────────────────────────────────────
// Routes "candidats" — /api/candidats (réservées à l'établissement).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as candidatController from '../controllers/candidat.controller.js';
import * as pieceController from '../controllers/piece.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { recevoirFichier } from '../middlewares/televersement.middleware.js';
import { requirePermission } from '../services/permissions.service.js';
import { TAILLE_MAX_OCTETS } from '../services/piece-jointe.service.js';

const router = Router();

const recevoirPiece = recevoirFichier({
  tailleMax: TAILLE_MAX_OCTETS,
  extensions: /\.(pdf|jpe?g|png)$/i,
  messageFormat: 'Formats acceptés : PDF, JPEG, PNG.',
});

// Toutes les routes exigent un agent d'établissement authentifié.
router.use(authJWT, requireRole('etablissement'));

router.get('/', candidatController.lister);
router.post('/', requirePermission('candidat.creer'), candidatController.creer);
router.get('/:id', candidatController.recuperer);
router.put('/:id', candidatController.modifier);
router.delete('/:id', requirePermission('candidat.supprimer'), candidatController.supprimer);

// ── Pièces justificatives de l'étudiant ────────────────────────────
router.get('/:id/pieces', pieceController.listerPourCandidat);
router.post(
  '/:id/pieces',
  requirePermission('piece.deposer'),
  recevoirPiece,
  pieceController.deposerPourCandidat
);

export default router;
