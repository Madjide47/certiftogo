// ─────────────────────────────────────────────────────────────
// Routes "dossiers" — /api/dossiers (réservées à l'établissement).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as dossierController from '../controllers/dossier.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { requirePermission } from '../services/permissions.service.js';

const router = Router();

router.use(authJWT, requireRole('etablissement'));

router.get('/', dossierController.lister);
router.post('/', dossierController.creer);
router.get('/:id', dossierController.recuperer);
router.put('/:id', dossierController.modifier);
router.post('/:id/transmettre', dossierController.transmettre);
// Urgence déclarée après coup : réservée à qui engage l'établissement.
router.patch(
  '/:id/priorite',
  requirePermission('dossier.prioriser'),
  dossierController.definirPriorite
);
router.delete('/:id', dossierController.supprimer);

export default router;
