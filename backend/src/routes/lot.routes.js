// ─────────────────────────────────────────────────────────────
// Routes "lots" — /api/lots (réservées à l'établissement émetteur).
// Suivi de ce qui a été transmis au ministère.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as lotController from '../controllers/lot.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authJWT, requireRole('etablissement'));

router.get('/', lotController.listerPourEtablissement);
router.get('/:id', lotController.detaillerPourEtablissement);

export default router;
