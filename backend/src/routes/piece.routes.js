// ─────────────────────────────────────────────────────────────
// Routes "pièces justificatives" — /api/pieces.
//
// Le contenu d'une pièce n'est PAS servi en statique : chaque lecture
// passe par un contrôle de rôle et d'appartenance, et la consultation
// ministérielle laisse une trace. C'est la différence entre un relevé
// de notes et un QR code.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as pieceController from '../controllers/piece.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { requirePermission } from '../services/permissions.service.js';

const router = Router();

router.use(authJWT);

// Chemin fixe avant les paramétrés.
router.get('/types', pieceController.catalogue);

// Ouverture du document : établissement propriétaire, ministère, audit.
router.get('/:id/contenu', pieceController.contenu);

router.delete(
  '/:id',
  requireRole('etablissement'),
  requirePermission('piece.supprimer'),
  pieceController.supprimer
);

export default router;
