// ─────────────────────────────────────────────────────────────
// Routes "candidat" — /api/candidat (réservées au rôle candidat).
// Portefeuille de diplômes du candidat connecté.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as portefeuilleController from '../controllers/portefeuille.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authJWT, requireRole('candidat'));

router.get('/diplomes', portefeuilleController.listerDiplomes);
router.get('/statistiques', portefeuilleController.statistiques);

export default router;
