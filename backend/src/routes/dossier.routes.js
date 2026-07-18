// ─────────────────────────────────────────────────────────────
// Routes "dossiers" — /api/dossiers (réservées à l'établissement).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as dossierController from '../controllers/dossier.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authJWT, requireRole('etablissement'));

router.get('/', dossierController.lister);
router.post('/', dossierController.creer);
router.get('/:id', dossierController.recuperer);
router.put('/:id', dossierController.modifier);
router.post('/:id/transmettre', dossierController.transmettre);
router.delete('/:id', dossierController.supprimer);

export default router;
