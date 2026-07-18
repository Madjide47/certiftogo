// ─────────────────────────────────────────────────────────────
// Routes "candidats" — /api/candidats (réservées à l'établissement).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as candidatController from '../controllers/candidat.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

// Toutes les routes exigent un agent d'établissement authentifié.
router.use(authJWT, requireRole('etablissement'));

router.get('/', candidatController.lister);
router.post('/', candidatController.creer);
router.get('/:id', candidatController.recuperer);
router.put('/:id', candidatController.modifier);
router.delete('/:id', candidatController.supprimer);

export default router;
