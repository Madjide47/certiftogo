// ─────────────────────────────────────────────────────────────
// Routes "référentiel" — /api/referentiel
//
// Le référentiel académique est national : le ministère l'écrit, tous les
// comptes authentifiés le lisent (un établissement doit consulter les
// années et sessions ouvertes pour rattacher ses promotions).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import * as referentielController from '../controllers/referentiel.controller.js';
import { authJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.use(authJWT);

const ministere = requireRole('ministere', 'admin_systeme');

// ── Années académiques ─────────────────────────────────────────────
router.get('/annees', referentielController.listerAnnees);
router.post('/annees', ministere, referentielController.creerAnnee);
router.get('/annees/:id', referentielController.recupererAnnee);
router.patch('/annees/:id/statut', ministere, referentielController.changerStatutAnnee);
router.delete('/annees/:id', ministere, referentielController.supprimerAnnee);

// ── Sessions ───────────────────────────────────────────────────────
router.get('/annees/:id/sessions', referentielController.listerSessions);
router.post('/annees/:id/sessions', ministere, referentielController.creerSession);
router.patch('/sessions/:id/statut', ministere, referentielController.changerStatutSession);
router.delete('/sessions/:id', ministere, referentielController.supprimerSession);

export default router;
