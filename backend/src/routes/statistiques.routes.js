// ─────────────────────────────────────────────────────────────
// Routes "statistiques" — /api/statistiques
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as statistiquesController from '../controllers/statistiques.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

// Tableau de bord établissement.
router.get(
  '/etablissement',
  authJWT,
  requireRole('etablissement'),
  statistiquesController.etablissement
);

export default router;
